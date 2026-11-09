import { startOfStoreDay, type Backup, type Category, type PriceChange, type StoredProduct } from '../shared/store'
import { categoryName, comparable, productDraft, validateBackup } from './backup'
import { CatalogError, productName, type Catalog, type Product } from './catalog'

const dataStores = ['categories', 'products', 'history']
let opening: Promise<IDBDatabase> | undefined

function database() {
  if (!opening) {
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('asisten-harga', 1)
      let blocked = false
      request.onupgradeneeded = () => {
        const db = request.result
        for (const store of dataStores) db.createObjectStore(store, { keyPath: 'id' })
        db.createObjectStore('settings')
      }
      request.onerror = () => reject(request.error)
      request.onblocked = () => {
        blocked = true
        reject(new CatalogError('Tutup tab Asisten Harga lain, lalu muat ulang halaman.'))
      }
      request.onsuccess = () => {
        const db = request.result
        if (blocked) { db.close(); return }
        db.onversionchange = () => { db.close(); opening = undefined }
        db.onclose = () => { opening = undefined }
        resolve(db)
      }
    }).catch((error: unknown) => {
      opening = undefined
      throw error
    })
  }
  return opening
}

function read<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function run<T>(
  stores: string[], mode: IDBTransactionMode, action: (tx: IDBTransaction) => Promise<T>, signal?: AbortSignal,
) {
  const db = await database()
  signal?.throwIfAborted()
  const tx = db.transaction(stores, mode)
  const complete = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaksi dibatalkan.', 'AbortError'))
  })
  void complete.catch(() => {})
  const abort = () => {
    try { tx.abort() } catch { /* The transaction already ended. */ }
  }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const result = await action(tx)
    await complete
    return result
  } catch (error) {
    abort()
    await complete.catch(() => {})
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new CatalogError('Penyimpanan browser penuh. Cadangkan data sebelum mengosongkan ruang.')
    }
    throw error
  } finally {
    signal?.removeEventListener('abort', abort)
  }
}

const products = (tx: IDBTransaction) => read<StoredProduct[]>(tx.objectStore('products').getAll())
const categories = (tx: IDBTransaction) => read<Category[]>(tx.objectStore('categories').getAll())
const history = (tx: IDBTransaction) => read<PriceChange[]>(tx.objectStore('history').getAll())
const visible = (product: StoredProduct) => product.deleted_at === null
const active = (product: StoredProduct) => visible(product) && product.is_active

function publicFields({ cost_price: _cost, deleted_at: _deleted, ...product }: StoredProduct): Product {
  return product
}

function currentProduct(items: StoredProduct[], original: Product) {
  const current = items.find((item) => item.id === original.id)
  if (!current || !visible(current) || current.revision !== original.revision || current.updated_at !== original.updated_at) {
    throw new CatalogError('Produk telah berubah atau dihapus. Muat ulang katalog sebelum mencoba lagi.')
  }
  return current
}

type Pin = { salt: Uint8Array<ArrayBuffer>; hash: string }
const storedPin = (tx: IDBTransaction) => read<Pin | undefined>(tx.objectStore('settings').get('pin'))

async function pinHash(pin: string, salt: Uint8Array<ArrayBuffer>) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 150_000, hash: 'SHA-256' }, key, 256)
  return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export const storeCatalog: Catalog = {
  dashboard(signal) {
    return run([...dataStores, 'settings'], 'readonly', async (tx) => {
      const [all, groups, changes, pin] = await Promise.all([products(tx), categories(tx), history(tx), storedPin(tx)])
      const listed = all.filter(visible)
      const today = startOfStoreDay()
      return {
        products: listed.map(publicFields),
        categories: groups.sort((left, right) => left.name.localeCompare(right.name, 'id')),
        changedToday: new Set(changes.filter((change) => change.changed_at >= today).map((change) => change.product_id)).size,
        hasPin: Boolean(pin),
        costs: Object.fromEntries(listed.flatMap((item) => item.cost_price === null ? [] : [[item.id, item.cost_price]])),
      }
    }, signal)
  },
  searchCatalog(signal) {
    return run(['products'], 'readonly', async (tx) => (await products(tx)).filter(active).map(publicFields), signal)
  },
  getActive(id, signal) {
    return run(['products'], 'readonly', async (tx) => {
      const item = await read<StoredProduct | undefined>(tx.objectStore('products').get(id))
      return item && active(item) ? publicFields(item) : null
    }, signal)
  },
  history(id, signal) {
    return run(['history'], 'readonly', async (tx) =>
      (await history(tx)).filter((item) => !id || item.product_id === id)
        .sort((left, right) => right.changed_at.localeCompare(left.changed_at) || right.id.localeCompare(left.id)), signal)
  },
  async save(input, original) {
    const draft = productDraft(input)
    await run(dataStores, 'readwrite', async (tx) => {
      const all = await products(tx)
      const previous = original ? currentProduct(all, original) : null
      const sku = draft.sku
      if (sku && all.some((item) => visible(item) && item.id !== previous?.id && item.sku && comparable(item.sku) === comparable(sku))) {
        throw new CatalogError('SKU sudah dipakai produk lain.')
      }
      if (draft.category_id && !await read(tx.objectStore('categories').get(draft.category_id))) {
        throw new CatalogError('Kategori sudah tidak tersedia. Muat ulang katalog.')
      }
      const now = new Date().toISOString()
      const item: StoredProduct = {
        ...draft, id: previous?.id ?? crypto.randomUUID(), revision: (previous?.revision ?? 0) + 1,
        created_at: previous?.created_at ?? now, updated_at: now, deleted_at: null,
      }
      tx.objectStore('products').put(item)
      if (previous && previous.sale_price !== item.sale_price) {
        const change: PriceChange = {
          id: crypto.randomUUID(), product_id: item.id, product_label: [productName(item), item.variant].filter(Boolean).join(' '),
          old_price: previous.sale_price, new_price: item.sale_price, changed_at: now,
        }
        tx.objectStore('history').add(change)
      }
    })
  },
  async remove(original) {
    await run(['products'], 'readwrite', async (tx) => {
      const current = currentProduct(await products(tx), original)
      const now = new Date().toISOString()
      tx.objectStore('products').put({ ...current, is_active: false, deleted_at: now, updated_at: now, revision: current.revision + 1 })
    })
  },
  async saveCategory(value, original) {
    const name = categoryName(value)
    await run(['categories'], 'readwrite', async (tx) => {
      const all = await categories(tx)
      if (original && !all.some((item) => item.id === original.id && item.name === original.name)) {
        throw new CatalogError('Kategori telah berubah. Muat ulang katalog.')
      }
      if (all.some((item) => item.id !== original?.id && comparable(item.name) === comparable(name))) {
        throw new CatalogError('Nama kategori sudah dipakai.')
      }
      tx.objectStore('categories').put({ id: original?.id ?? crypto.randomUUID(), name })
    })
  },
  async removeCategory(category) {
    await run(['categories', 'products'], 'readwrite', async (tx) => {
      const current = await read<Category | undefined>(tx.objectStore('categories').get(category.id))
      if (current?.name !== category.name) throw new CatalogError('Kategori telah berubah. Muat ulang katalog.')
      const all = await products(tx)
      const now = new Date().toISOString()
      for (const item of all) {
        if (item.category_id === category.id) {
          tx.objectStore('products').put({ ...item, category_id: null, updated_at: now, revision: item.revision + 1 })
        }
      }
      tx.objectStore('categories').delete(category.id)
    })
  },
  async unlock(pin) {
    const current = await run(['settings'], 'readonly', storedPin)
    if (!current || await pinHash(pin, current.salt) !== current.hash) {
      throw new CatalogError('PIN salah. Periksa lalu coba lagi.')
    }
  },
  async configurePin(pin) {
    let value: Pin | null = null
    if (pin !== null) {
      if (!/^\d{6,12}$/.test(pin)) throw new CatalogError('PIN harus berisi 6 sampai 12 angka.')
      const salt = crypto.getRandomValues(new Uint8Array(16))
      value = { salt, hash: await pinHash(pin, salt) }
    }
    await run(['settings'], 'readwrite', async (tx) => {
      const settings = tx.objectStore('settings')
      if (value) settings.put(value, 'pin')
      else settings.delete('pin')
    })
  },
  exportBackup() {
    return run(dataStores, 'readonly', async (tx) => {
      const [groups, items, changes] = await Promise.all([categories(tx), products(tx), history(tx)])
      return { format: 'asisten-harga', version: 1, categories: groups, products: items, history: changes } satisfies Backup
    })
  },
  async importBackup(backup) {
    const validated = validateBackup(backup)
    await run(dataStores, 'readwrite', async (tx) => {
      for (const name of ['categories', 'products', 'history'] as const) {
        const store = tx.objectStore(name)
        store.clear()
        for (const item of validated[name]) store.add(item)
      }
    })
  },
}
