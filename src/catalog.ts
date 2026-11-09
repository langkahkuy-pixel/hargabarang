import { MAX_AMOUNT, type Backup, type Category, type DashboardData, type PriceChange, type Product, type ProductDraft } from '../shared/store'

export type { Category, DashboardData, PriceChange, Product, ProductDraft }

export interface Catalog {
  dashboard(signal: AbortSignal): Promise<DashboardData>
  searchCatalog(signal: AbortSignal): Promise<Product[]>
  getActive(id: string, signal: AbortSignal): Promise<Product | null>
  history(productId: string | null, signal: AbortSignal): Promise<PriceChange[]>
  save(draft: ProductDraft, original: Product | null): Promise<void>
  remove(product: Product): Promise<void>
  saveCategory(name: string, original: Category | null): Promise<void>
  removeCategory(category: Category): Promise<void>
  unlock(pin: string): Promise<void>
  configurePin(pin: string | null): Promise<void>
  exportBackup(): Promise<Backup>
  importBackup(backup: Backup): Promise<void>
}

const money = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })
const dateTime = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta',
})
export const rupiah = (value: number) => `Rp ${money.format(value)}`
export const localDateTime = (value: string) => `${dateTime.format(new Date(value))} WIB`
export const productName = (product: Product) => [product.name, product.brand].filter(Boolean).join(' ')
export const productDescription = (product: Product) =>
  [product.variant, product.unit ? `per ${product.unit}` : ''].filter(Boolean).join(' · ')

export class CatalogError extends Error {}

export const catalogErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof CatalogError) return error.message
  return fallback
}

export function parseAmount(input: string, label: string, required = false) {
  const value = input.trim()
  if (!value && !required) return null
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(value) || Number(value.replace(',', '.')) > MAX_AMOUNT) {
    throw new CatalogError(`${label} harus berupa angka 0–9.999.999.999,99. Gunakan angka tanpa pemisah ribuan.`)
  }
  return Number(value.replace(',', '.'))
}
