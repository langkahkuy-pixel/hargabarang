import { beforeAll, describe, expect, it, vi } from 'vitest'
import { hashPin } from '../server/admin'
import { createStoreApi } from '../server/api'
import type { StoreRepository } from '../server/repository'
import { draft, exampleProducts } from './fixtures'

const origin = 'https://asisten.example'
const pin = '0019876543'
const env: NodeJS.ProcessEnv = { ADMIN_SESSION_SECRET: 'e1'.repeat(32), VERCEL: '1' }
const productId = exampleProducts()[0].id

beforeAll(async () => { env.ADMIN_PIN_HASH = await hashPin(pin) })

function setup() {
  let currentTime = 1_800_000_000_000
  const store = {
    dashboard: vi.fn(async (adminUntil: number | null) => ({ products: exampleProducts(), categories: [], changedToday: 0, adminUntil })),
    searchCatalog: vi.fn(async () => exampleProducts()),
    activeProduct: vi.fn(async () => null),
    history: vi.fn(async () => []),
    saveProduct: vi.fn(async () => productId),
    deleteProduct: vi.fn(async () => {}),
    saveCategory: vi.fn(async () => productId),
    deleteCategory: vi.fn(async () => {}),
    reservePinAttempt: vi.fn(async () => true),
  } satisfies StoreRepository
  const api = createStoreApi(() => store, env, () => currentTime)
  function call(resource: string, method = 'GET', body?: object, headers: Record<string, string> = {}) {
    return api(new Request(`${origin}/api/store?resource=${resource}`, {
      method, body: body && JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', Origin: origin, 'X-Store-Request': '1', ...headers },
    }))
  }
  async function unlock() {
    const response = await call('admin', 'POST', { pin })
    expect(response.status).toBe(200)
    return response.headers.get('set-cookie')!.split(';')[0]
  }
  return { store, api, call, unlock, advance: (milliseconds: number) => { currentTime += milliseconds } }
}

describe('API toko', () => {
  it('membuka dashboard dan katalog jual tanpa akun atau PIN', async () => {
    const { call, store } = setup()
    const dashboard = await call('dashboard')
    expect(dashboard.status).toBe(200)
    expect(dashboard.headers.get('cache-control')).toContain('no-store')
    expect(await dashboard.json()).not.toHaveProperty('costs')
    expect(store.dashboard).toHaveBeenCalledWith(null)
    expect(await (await call('products')).json()).toHaveLength(6)
    expect((await call('history')).status).toBe(401)
  })

  it('menolak setiap endpoint perubahan tanpa cookie admin', async () => {
    const { call, store } = setup()
    for (const resource of ['products', 'categories']) {
      for (const method of ['POST', 'PUT', 'DELETE']) {
        expect((await call(resource, method, { ...draft, pin })).status).toBe(401)
      }
    }
    for (const operation of [store.saveProduct, store.deleteProduct, store.saveCategory, store.deleteCategory]) {
      expect(operation).not.toHaveBeenCalled()
    }
  })

  it('memverifikasi PIN lalu memakai cookie HttpOnly dengan masa berlaku', async () => {
    const { call, store, advance } = setup()
    expect((await call('admin', 'POST', { pin: '000000' })).status).toBe(401)
    const unlock = await call('admin', 'POST', { pin })
    expect(unlock.status).toBe(200)
    const cookie = unlock.headers.get('set-cookie')!
    expect(cookie).toMatch(/^__Host-store_admin=/)
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Max-Age=1800']) expect(cookie).toContain(flag)
    expect(await unlock.json()).toEqual({ adminUntil: 1_800_001_800_000 })
    const headers = { Cookie: cookie.split(';')[0] }
    expect((await call('products', 'POST', draft, headers)).status).toBe(201)
    expect(store.saveProduct).toHaveBeenCalledWith(draft, null)
    expect((await call('history', 'GET', undefined, headers)).status).toBe(200)
    advance(1_800_000)
    expect((await call('products', 'POST', draft, headers)).status).toBe(401)
  })

  it('menolak cookie palsu dan perubahan dari origin lain', async () => {
    const { call, unlock, store } = setup()
    const cookie = await unlock()
    const tampered = cookie.slice(0, -1) + (cookie.endsWith('a') ? 'b' : 'a')
    expect((await call('products', 'POST', draft, { Cookie: tampered })).status).toBe(401)
    expect((await call('products', 'POST', draft, { Cookie: cookie, Origin: 'https://lain.example' })).status).toBe(403)
    expect((await call('products', 'POST', draft, { Cookie: cookie, 'X-Store-Request': '' })).status).toBe(403)
    expect(store.saveProduct).not.toHaveBeenCalled()
    expect((await call('admin', 'DELETE', undefined, { Cookie: cookie })).headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('membatasi percobaan PIN sebelum memverifikasi hash', async () => {
    const { call, store } = setup()
    store.reservePinAttempt.mockResolvedValue(false)
    const response = await call('admin', 'POST', { pin })
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('300')
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('menolak data, ID, versi, dan body berlebih sebelum mengakses penyimpanan', async () => {
    const { call, unlock, store } = setup()
    const headers = { Cookie: await unlock() }
    for (const invalid of [
      { ...draft, sale_price: -1 },
      { ...draft, sale_price: 1.111 },
      { ...draft, cost_price: '1000' },
      { ...draft, aliases: [''] },
      { ...draft, category_id: 'x' },
      { ...draft, name: '  ' },
    ]) expect((await call('products', 'POST', invalid, headers)).status).toBe(400)
    expect((await call('products&id=1%20OR%201%3D1', 'DELETE', { revision: 1 }, headers)).status).toBe(400)
    expect((await call(`products&id=${productId}`, 'PUT', { ...draft, revision: 0 }, headers)).status).toBe(400)
    expect((await call('products', 'POST', { ...draft, name: 'x'.repeat(17_000) }, headers)).status).toBe(413)
    expect(store.saveProduct).not.toHaveBeenCalled()
    expect(store.deleteProduct).not.toHaveBeenCalled()
    expect((await call(`products&id=${productId}`, 'PUT', { ...draft, revision: 2 }, headers)).status).toBe(200)
    expect(store.saveProduct).toHaveBeenCalledWith(draft, { id: productId, revision: 2 })
  })
})
