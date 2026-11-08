import { CatalogError, type Catalog } from './catalog'

async function call<T>(resource: string, options: {
  id?: string; method?: 'POST' | 'PUT' | 'DELETE'; body?: object; signal?: AbortSignal
} = {}): Promise<T> {
  const query = new URLSearchParams({ resource })
  if (options.id) query.set('id', options.id)
  const headers: Record<string, string> = {}
  if (options.method) headers['X-Store-Request'] = '1'
  if (options.body) headers['Content-Type'] = 'application/json'
  const response = await fetch(`/api/store?${query}`, {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
    credentials: 'same-origin',
    signal: options.signal,
  })
  const data = await response.json().catch(() => {
    throw new CatalogError('Layanan toko gagal merespons. Coba lagi.')
  })
  if (!response.ok) {
    throw new CatalogError(data?.message ?? 'Layanan toko gagal merespons. Coba lagi.', data?.code)
  }
  if (data === null && !(resource === 'products' && options.id && !options.method)) {
    throw new CatalogError('Katalog gagal dimuat. Coba lagi.')
  }
  return data as T
}

export const storeCatalog: Catalog = {
  dashboard: (signal) => call('dashboard', { signal }),
  searchCatalog: (signal) => call('products', { signal }),
  getActive: (id, signal) => call('products', { id, signal }),
  history: (id, signal) => call('history', { id: id ?? undefined, signal }),
  async save(draft, original) {
    await call('products', {
      method: original ? 'PUT' : 'POST',
      id: original?.id,
      body: { ...draft, revision: original?.revision },
    })
  },
  async remove(product) {
    await call('products', { method: 'DELETE', id: product.id, body: { revision: product.revision } })
  },
  async saveCategory(name, original) {
    await call('categories', { method: original ? 'PUT' : 'POST', id: original?.id, body: { name } })
  },
  async removeCategory(category) {
    await call('categories', { method: 'DELETE', id: category.id })
  },
  async unlock(pin) {
    await call('admin', { method: 'POST', body: { pin } })
  },
  async lock() {
    await call('admin', { method: 'DELETE' })
  },
}
