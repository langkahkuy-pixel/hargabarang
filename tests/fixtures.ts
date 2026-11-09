import type { Backup, Product } from '../shared/store'

const rows = [
  ['Minyak Goreng', 'Bimoli', '1 liter', 'pouch', 'MYK-001', ['minyak bimoli'], 21500, 24],
  ['Minyak Goreng', 'Bimoli', '2 liter', 'pouch', 'MYK-002', ['minyak bimoli'], 41000, 16],
  ['Gula Pasir', 'Gulaku', '1 kg', 'bungkus', 'GLA-001', ['gula putih'], 18500, 32],
  ['Beras', 'Pandan Wangi', '5 kg', 'karung', 'BRS-005', ['beras pandan'], 78000, 10],
  ['Telur Ayam', '', '1 kg', 'kg', 'TLR-001', ['telur negeri'], 29000, 12],
  ['Mi Goreng', 'Indomie', '85 g', 'bungkus', 'MIE-085', ['indomie goreng', 'mie goreng'], 3500, 48],
] as const

export const exampleProducts = (): Product[] => rows.map(([name, brand, variant, unit, sku, aliases, sale_price, stock_qty], index) => ({
  id: `139e0fb4-479f-4fae-a290-561f8176c00${index + 1}`,
  category_id: null, revision: 1, name, brand, variant, unit, sku, aliases: [...aliases],
  sale_price, stock_qty, is_active: true, created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString(),
}))

export const exampleBackup = (): Backup => ({
  format: 'asisten-harga', version: 1, categories: [], history: [],
  products: exampleProducts().map((product) => ({
    ...product, cost_price: product.sku === 'MYK-002' ? 38000 : null, deleted_at: null,
  })),
})
