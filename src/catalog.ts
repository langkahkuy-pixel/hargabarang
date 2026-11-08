export type Role = 'owner' | 'staff'

export type Member = {
  userId: string
  email: string
  storeId: string
  storeName: string
  role: Role
}

export type Product = {
  id: string
  store_id: string
  name: string
  brand: string
  variant: string
  unit: string
  sku: string | null
  aliases: string[]
  sale_price: number
  stock_qty: number | null
  is_active: boolean
  updated_at: string
  created_at: string
}

export type ProductDraft = Omit<Product, 'id' | 'store_id' | 'updated_at' | 'created_at'> & {
  cost_price: number | null
}

export type PriceChange = {
  id: string
  store_id: string
  product_id: string
  old_price: number
  new_price: number
  changed_by: string
  changed_at: string
}

export interface Catalog {
  list(activeOnly: boolean, signal: AbortSignal): Promise<Product[]>
  getActive(id: string, signal: AbortSignal): Promise<Product | null>
  history(productId: string | null, since: string | null, signal: AbortSignal): Promise<PriceChange[]>
  costs(signal: AbortSignal): Promise<Map<string, number>>
  save(draft: ProductDraft, original: Product | null): Promise<void>
}

const money = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })
const dateTime = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta',
})
const jakartaDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
})

export const rupiah = (value: number) => `Rp ${money.format(value)}`
export const localDateTime = (value: string) => `${dateTime.format(new Date(value))} WIB`
export function startOfStoreDay(now = new Date()) {
  const parts = Object.fromEntries(jakartaDate.formatToParts(now).map(({ type, value }) => [type, value]))
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+07:00`).toISOString()
}
export const productName = (product: Product) => [product.name, product.brand].filter(Boolean).join(' ')
export const productDescription = (product: Product) =>
  [product.variant, product.unit ? `per ${product.unit}` : ''].filter(Boolean).join(' · ')

export class CatalogError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message)
  }
}

export const catalogErrorMessage = (error: unknown, fallback: string) => {
  if (!navigator.onLine) return 'Koneksi terputus. Coba lagi saat perangkat tersambung.'
  if (error instanceof CatalogError) return error.message
  return fallback
}

export function parseAmount(input: string, label: string, required = false) {
  const value = input.trim()
  if (!value && !required) return null
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(value) || Number(value.replace(',', '.')) > 9_999_999_999.99) {
    throw new CatalogError(`${label} harus berupa angka 0–9.999.999.999,99. Gunakan angka tanpa pemisah ribuan.`)
  }
  return Number(value.replace(',', '.'))
}
