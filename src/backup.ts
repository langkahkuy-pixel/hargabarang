import { MAX_AMOUNT, type Backup, type Category, type PriceChange, type ProductDraft, type StoredProduct } from '../shared/store'
import { CatalogError } from './catalog'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const comparable = (value: string) => value.trim().toLowerCase()

function invalid(message: string): never {
  throw new CatalogError(message)
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('Struktur objek cadangan tidak valid.')
  return value as Record<string, unknown>
}

function list(value: unknown, label: string) {
  if (!Array.isArray(value)) return invalid(`Daftar ${label} tidak valid.`)
  return value as unknown[]
}

function id(value: unknown) {
  if (typeof value !== 'string' || !uuid.test(value)) return invalid('ID pada cadangan tidak valid.')
  return value.toLowerCase()
}

function text(value: unknown, label: string, limit: number, required = false) {
  if (typeof value !== 'string') return invalid(`${label} tidak valid.`)
  const clean = value.trim()
  if ((required && !clean) || [...clean].length > limit || /[\u0000-\u001f\u007f]/.test(clean)) {
    return invalid(`${label} harus berisi ${required ? '1 sampai' : 'maksimal'} ${limit} karakter.`)
  }
  return clean
}

export const categoryName = (value: unknown) => text(value, 'Nama kategori', 80, true)

function amount(value: unknown, label: string): number {
  if (typeof value !== 'number' || value < 0 || value > MAX_AMOUNT || Number(value.toFixed(2)) !== value) {
    return invalid(`${label} harus berupa angka 0–9.999.999.999,99 dengan maksimal dua angka desimal.`)
  }
  return value
}

export function productDraft(input: Record<string, unknown>): ProductDraft {
  const aliases = list(input.aliases, 'alias')
  if (aliases.length > 32) return invalid('Maksimal 32 alias pencarian.')
  if (typeof input.is_active !== 'boolean') return invalid('Status produk tidak valid.')
  const unit = text(input.unit, 'Satuan', 40, true)
  const rounding = input.weight_rounding === undefined ? undefined : amount(input.weight_rounding, 'Pembulatan')
  if (rounding !== undefined && (!Number.isInteger(rounding) || unit !== 'kg')) {
    return invalid('Harga curah memakai satuan kg dan pembulatan dalam rupiah bulat.')
  }
  return {
    category_id: input.category_id === null ? null : id(input.category_id),
    name: text(input.name, 'Nama barang', 100, true),
    brand: text(input.brand, 'Merek', 80),
    variant: text(input.variant, 'Varian', 80),
    unit,
    sku: input.sku === null ? null : text(input.sku, 'SKU', 60, true),
    aliases: [...new Set(aliases.map((alias) => text(alias, 'Alias', 100, true)))],
    sale_price: amount(input.sale_price, 'Harga jual'),
    ...(rounding === undefined ? {} : { weight_rounding: rounding }),
    cost_price: input.cost_price === null ? null : amount(input.cost_price, 'Harga modal'),
    stock_qty: input.stock_qty === null ? null : amount(input.stock_qty, 'Stok'),
    is_active: input.is_active,
  }
}

function timestamp(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return invalid('Tanggal cadangan harus menggunakan format ISO UTC dengan milidetik.')
  }
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) return invalid('Tanggal pada cadangan tidak valid.')
  return value
}

function unique(values: string[], label: string) {
  const keys = new Set(values)
  if (keys.size !== values.length) return invalid(`${label} ganda pada cadangan.`)
  return keys
}

export function validateBackup(value: unknown): Backup {
  const root = object(value)
  if (root.format !== 'asisten-harga' || root.version !== 1) return invalid('Format atau versi cadangan tidak didukung.')
  const categories: Category[] = list(root.categories, 'kategori').map((value) => {
    const item = object(value)
    return { id: id(item.id), name: categoryName(item.name) }
  })
  const categoryIds = unique(categories.map((item) => item.id), 'ID kategori')
  unique(categories.map((item) => comparable(item.name)), 'Nama kategori')

  const products: StoredProduct[] = list(root.products, 'produk').map((value) => {
    const item = object(value)
    const draft = productDraft(item)
    if (draft.category_id && !categoryIds.has(draft.category_id)) return invalid('Ada produk yang merujuk kategori yang tidak tersedia.')
    const revision = item.revision
    if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1 || revision >= Number.MAX_SAFE_INTEGER) {
      return invalid('Revisi produk tidak valid.')
    }
    return {
      ...draft, id: id(item.id), revision,
      created_at: timestamp(item.created_at), updated_at: timestamp(item.updated_at),
      deleted_at: item.deleted_at === null ? null : timestamp(item.deleted_at),
    }
  })
  const productIds = unique(products.map((item) => item.id), 'ID produk')
  unique(products.flatMap((item) => item.deleted_at === null && item.sku ? [comparable(item.sku)] : []), 'SKU')

  const history: PriceChange[] = list(root.history, 'riwayat').map((value) => {
    const item = object(value)
    const productId = id(item.product_id)
    if (!productIds.has(productId)) return invalid('Ada riwayat yang merujuk produk yang tidak tersedia.')
    return {
      id: id(item.id), product_id: productId, product_label: text(item.product_label, 'Nama pada riwayat', 270, true),
      old_price: amount(item.old_price, 'Harga lama'), new_price: amount(item.new_price, 'Harga baru'),
      changed_at: timestamp(item.changed_at),
    }
  })
  unique(history.map((item) => item.id), 'ID riwayat')
  return { format: 'asisten-harga', version: 1, categories, products, history }
}

export function parseBackup(source: string) {
  let data: unknown
  try {
    data = JSON.parse(source)
  } catch {
    return invalid('File cadangan harus berisi JSON yang valid.')
  }
  return validateBackup(data)
}
