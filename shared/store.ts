export type Category = { id: string; name: string }

export type Product = {
  id: string
  category_id: string | null
  name: string
  brand: string
  variant: string
  unit: string
  sku: string | null
  aliases: string[]
  sale_price: number
  weight_rounding?: number
  stock_qty: number | null
  is_active: boolean
  revision: number
  updated_at: string
  created_at: string
}

export type ProductDraft = Omit<Product, 'id' | 'revision' | 'updated_at' | 'created_at'> & {
  cost_price: number | null
}

export type PriceChange = {
  id: string
  product_id: string
  product_label: string
  old_price: number
  new_price: number
  changed_at: string
}

export type StoredProduct = Product & { cost_price: number | null; deleted_at: string | null }

export type Backup = {
  format: 'asisten-harga'
  version: 1
  categories: Category[]
  products: StoredProduct[]
  history: PriceChange[]
}

export type DashboardData = {
  products: Product[]
  categories: Category[]
  changedToday: number
  hasPin: boolean
  costs: Record<string, number>
}

export const MAX_AMOUNT = 9_999_999_999.99

export function startOfStoreDay(now = new Date()) {
  const hour = 60 * 60 * 1000
  const day = 24 * hour
  const wib = 7 * hour
  return new Date(Math.floor((now.getTime() + wib) / day) * day - wib).toISOString()
}
