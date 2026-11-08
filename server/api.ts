import { adminAccess } from './admin.js'
import { ApiError } from './errors.js'
import { createRepository, createStorePool, type StoreRepository } from './repository.js'
import { categoryName, id, pinPattern, productDraft, readObject, revision } from './validation.js'

function json(value: unknown, status = 200, extra?: HeadersInit) {
  const headers = new Headers(extra)
  headers.set('Cache-Control', 'private, no-store')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Cross-Origin-Resource-Policy', 'same-origin')
  return Response.json(value, { status, headers })
}

const missingRoute = () => new ApiError(404, 'NOT_FOUND', 'Layanan tidak ditemukan.')
const missingAdmin = () => new ApiError(401, 'ADMIN_REQUIRED', 'Buka mode admin dengan PIN untuk melanjutkan.')

function requireSameOrigin(request: Request, url: URL) {
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  if (request.headers.get('x-store-request') !== '1' || (origin && origin !== url.origin)
      || (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none')) {
    throw new ApiError(403, 'REQUEST_BLOCKED', 'Permintaan ini tidak diizinkan.')
  }
}

export function createStoreApi(repository: () => StoreRepository, env: NodeJS.ProcessEnv, now = Date.now) {
  const admin = adminAccess(env, now)
  return async (request: Request) => {
    const url = new URL(request.url)
    const resource = url.searchParams.get('resource') ?? 'dashboard'
    const itemId = url.searchParams.get('id')
    try {
      if (request.method === 'GET') {
        switch (resource) {
          case 'dashboard':
            return json(await repository().dashboard(admin.until(request)))
          case 'products':
            return json(itemId ? await repository().activeProduct(id(itemId)) : await repository().searchCatalog())
          case 'history':
            if (!admin.until(request)) throw missingAdmin()
            return json(await repository().history(itemId ? id(itemId) : null))
          default:
            throw missingRoute()
        }
      }

      if (!['POST', 'PUT', 'DELETE'].includes(request.method)) {
        throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Metode permintaan tidak diizinkan.')
      }
      requireSameOrigin(request, url)
      if (resource === 'admin') {
        if (request.method === 'DELETE') return json({ ok: true }, 200, { 'Set-Cookie': admin.lock(request) })
        if (request.method !== 'POST') throw missingRoute()
        admin.requireConfig()
        const { pin } = await readObject(request)
        if (typeof pin !== 'string' || !pinPattern.test(pin)) {
          throw new ApiError(400, 'INVALID_PIN_FORMAT', 'PIN harus berisi 6 sampai 12 angka.')
        }
        if (!await repository().reservePinAttempt()) {
          return json({
            code: 'PIN_RATE_LIMIT', message: 'Terlalu banyak percobaan PIN. Coba lagi dalam beberapa menit.',
          }, 429, { 'Retry-After': '300' })
        }
        if (!await admin.verifyPin(pin)) throw new ApiError(401, 'INVALID_PIN', 'PIN salah. Periksa lalu coba lagi.')
        const session = admin.unlock(request)
        return json({ adminUntil: session.until }, 200, { 'Set-Cookie': session.cookie })
      }

      if (!admin.until(request)) throw missingAdmin()
      if (resource === 'products') {
        if (request.method === 'DELETE') {
          await repository().deleteProduct(id(itemId), revision((await readObject(request)).revision))
          return json({ ok: true })
        }
        const data = await readObject(request)
        const original = request.method === 'PUT' ? { id: id(itemId), revision: revision(data.revision) } : null
        const saved = await repository().saveProduct(productDraft(data), original)
        return json({ id: saved }, original ? 200 : 201)
      }
      if (resource === 'categories') {
        if (request.method === 'DELETE') {
          await repository().deleteCategory(id(itemId))
          return json({ ok: true })
        }
        const original = request.method === 'PUT' ? id(itemId) : null
        const saved = await repository().saveCategory(categoryName(await readObject(request)), original)
        return json({ id: saved }, original ? 200 : 201)
      }
      throw missingRoute()
    } catch (error) {
      if (error instanceof ApiError) return json({ code: error.code, message: error.message }, error.status)
      const dbCode = (error as { code?: unknown } | null)?.code
      if (dbCode === 'ER_DUP_ENTRY') {
        return json({
          code: 'DUPLICATE', message: resource === 'categories' ? 'Nama kategori sudah dipakai.' : 'SKU sudah dipakai produk lain.',
        }, 409)
      }
      if (dbCode === 'ER_NO_REFERENCED_ROW_2') {
        return json({ code: 'CATEGORY_MISSING', message: 'Kategori sudah tidak tersedia. Muat ulang katalog.' }, 409)
      }
      console.error('Store API failed', typeof dbCode === 'string' ? dbCode : 'UNKNOWN')
      return json({ code: 'DATABASE_ERROR', message: 'Data toko gagal diproses. Coba lagi dalam beberapa saat.' }, 503)
    }
  }
}

export function configuredStoreApi(env: NodeJS.ProcessEnv) {
  let store: StoreRepository | undefined
  return createStoreApi(() => store ??= createRepository(createStorePool(env)), env)
}
