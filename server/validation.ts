import { MAX_AMOUNT, type ProductDraft } from '../shared/store.js'
import { ApiError } from './errors.js'

export const pinPattern = /^\d{6,12}$/
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const bodyLimit = 16_384

function invalid(message: string): never {
  throw new ApiError(400, 'INVALID_INPUT', message)
}

export async function readObject(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new ApiError(415, 'JSON_REQUIRED', 'Kirim data sebagai JSON.')
  }
  const reader = request.body?.getReader()
  if (!reader) return invalid('Data belum diisi.')
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let length = 0
  let source = ''
  let parsed: unknown
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > bodyLimit) {
        void reader.cancel().catch(() => {})
        throw new ApiError(413, 'BODY_TOO_LARGE', 'Data yang dikirim terlalu besar.')
      }
      source += decoder.decode(value, { stream: true })
    }
    parsed = JSON.parse(source + decoder.decode())
  } catch (error) {
    if (error instanceof ApiError) throw error
    return invalid('Format JSON tidak valid.')
  } finally {
    reader.releaseLock()
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return invalid('Format data tidak valid.')
  return parsed as Record<string, unknown>
}

export function id(value: unknown, label = 'ID') {
  if (typeof value !== 'string' || !uuid.test(value)) return invalid(`${label} tidak valid.`)
  return value.toLowerCase()
}

function text(value: unknown, label: string, limit: number, required = false) {
  if (typeof value !== 'string') return invalid(`${label} tidak valid.`)
  const clean = value.trim()
  if ((required && !clean) || clean.length > limit || /[\u0000-\u001f\u007f]/.test(clean)) {
    return invalid(`${label} harus berisi ${required ? '1 sampai' : 'maksimal'} ${limit} karakter.`)
  }
  return clean
}

function amount(value: unknown, label: string, required: true): number
function amount(value: unknown, label: string, required?: false): number | null
function amount(value: unknown, label: string, required = false) {
  if (!required && value === null) return null
  if (typeof value !== 'number' || value < 0 || value > MAX_AMOUNT || Number(value.toFixed(2)) !== value) {
    return invalid(`${label} harus berupa angka 0–9.999.999.999,99 dengan maksimal dua angka desimal.`)
  }
  return value
}

export function revision(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 4_294_967_295) {
    return invalid('Versi produk tidak valid. Muat ulang katalog.')
  }
  return value
}

export function productDraft(input: Record<string, unknown>): ProductDraft {
  if (!Array.isArray(input.aliases) || input.aliases.length > 32) return invalid('Maksimal 32 alias pencarian.')
  if (typeof input.is_active !== 'boolean') return invalid('Status produk tidak valid.')
  return {
    category_id: input.category_id === null ? null : id(input.category_id, 'Kategori'),
    name: text(input.name, 'Nama barang', 100, true),
    brand: text(input.brand, 'Merek', 80),
    variant: text(input.variant, 'Varian', 80),
    unit: text(input.unit, 'Satuan', 40, true),
    sku: input.sku === null ? null : text(input.sku, 'SKU', 60, true),
    aliases: [...new Set(input.aliases.map((alias) => text(alias, 'Alias', 100, true)))],
    sale_price: amount(input.sale_price, 'Harga jual', true),
    cost_price: amount(input.cost_price, 'Harga modal'),
    stock_qty: amount(input.stock_qty, 'Stok'),
    is_active: input.is_active,
  }
}

export const categoryName = (input: Record<string, unknown>) => text(input.name, 'Nama kategori', 80, true)
