import { CatalogError, type Product } from './catalog'

export function weightPrice(product: Product, grams: number) {
  const baseCents = BigInt(Math.round(product.sale_price * 100))
  const scaledCents = baseCents * BigInt(grams)
  const step = BigInt((product.weight_rounding ?? 0) * 100)
  const proportional = (scaledCents + 500n) / 1000n
  const block = step * 1000n
  const total = step > 0n && grams % 1000 !== 0
    ? (scaledCents + block - 1n) / block * step
    : proportional
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new CatalogError('Jumlah harga terlalu besar. Masukkan berat yang lebih kecil.')
  return { amount: Number(total) / 100, rounded: total > proportional }
}

export function displayWeight(grams: number) {
  if (grams < 1000) return `${grams.toLocaleString('id-ID')} gram`
  return `${(grams / 1000).toLocaleString('id-ID')} kg`
}
