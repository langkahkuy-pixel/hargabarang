import { CatalogError, type Catalog, type Member, type PriceChange, type Product } from './catalog'

export const demoMember: Member = {
  userId: 'demo-owner', email: 'demo@lokal', storeId: 'demo-store', storeName: 'Toko Sembako Makmur', role: 'owner',
}

const dataKey = 'asisten-harga:demo-catalog:v1'
export const demoSessionKey = 'asisten-harga:demo-session'
type DemoData = { products: Product[]; history: PriceChange[]; costs: Record<string, number> }

const rows = [
  ['Minyak Goreng', 'Bimoli', '1 liter', 'pouch', 'MYK-001', ['minyak bimoli'], 21500, 24],
  ['Minyak Goreng', 'Bimoli', '2 liter', 'pouch', 'MYK-002', ['minyak bimoli'], 41000, 16],
  ['Gula Pasir', 'Gulaku', '1 kg', 'bungkus', 'GLA-001', ['gula putih'], 18500, 32],
  ['Beras', 'Pandan Wangi', '5 kg', 'karung', 'BRS-005', ['beras pandan'], 78000, 10],
  ['Telur Ayam', '', '1 kg', 'kg', 'TLR-001', ['telur negeri'], 29000, 12],
  ['Mi Goreng', 'Indomie', '85 g', 'bungkus', 'MIE-085', ['indomie goreng', 'mie goreng'], 3500, 48],
] as const

export const demoProducts = (): Product[] => rows.map(([name, brand, variant, unit, sku, aliases, sale_price, stock_qty], index) => ({
  id: `demo-${index + 1}`, store_id: demoMember.storeId, name, brand, variant, unit, sku, aliases: [...aliases],
  sale_price, stock_qty, is_active: true, created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString(),
}))

function getData(): DemoData {
  const stored = localStorage.getItem(dataKey)
  if (stored) return JSON.parse(stored) as DemoData
  return { products: demoProducts(), history: [], costs: { 'demo-2': 38000 } }
}

export const demoCatalog: Catalog = {
  async list(activeOnly) {
    return getData().products.filter((product) => !activeOnly || product.is_active)
  },
  async getActive(id) {
    return getData().products.find((product) => product.id === id && product.is_active) ?? null
  },
  async history(productId, since) {
    return getData().history.filter((change) => (!productId || change.product_id === productId) && (!since || change.changed_at >= since))
  },
  async costs() {
    return new Map(Object.entries(getData().costs))
  },
  async save({ cost_price, ...draft }, original) {
    const data = getData()
    const existing = data.products.find((product) => product.id === original?.id)
    if (original && existing?.sale_price !== original.sale_price) {
      throw new CatalogError('Produk atau harga telah berubah. Muat ulang data sebelum menyimpan.', '40001')
    }
    const sku = draft.sku?.toLowerCase()
    if (sku && data.products.some((product) => product.id !== original?.id && product.sku?.toLowerCase() === sku)) {
      throw new CatalogError('SKU sudah dipakai produk lain.')
    }

    const now = new Date().toISOString()
    const id = original?.id ?? crypto.randomUUID()
    const product: Product = {
      ...draft, id, store_id: demoMember.storeId, created_at: original?.created_at ?? now, updated_at: now,
    }
    data.products = [...data.products.filter((entry) => entry.id !== id), product]
    if (cost_price === null) delete data.costs[id]
    else data.costs[id] = cost_price
    if (existing && existing.sale_price !== draft.sale_price) {
      data.history.unshift({
        id: crypto.randomUUID(), store_id: demoMember.storeId, product_id: id, old_price: existing.sale_price,
        new_price: draft.sale_price, changed_by: demoMember.userId, changed_at: now,
      })
    }
    localStorage.setItem(dataKey, JSON.stringify(data))
  },
}
