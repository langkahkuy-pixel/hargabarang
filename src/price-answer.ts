import { productName, type Product } from './catalog'

const digits = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan']
const scales = [[1_000_000_000_000, 'triliun'], [1_000_000_000, 'miliar'], [1_000_000, 'juta'], [1000, 'ribu'],
  [100, 'ratus'], [10, 'puluh']] as const

function integerWords(value: number): string {
  if (value < 10) return digits[value]
  if (value === 10) return 'sepuluh'
  if (value === 11) return 'sebelas'
  if (value < 20) return `${digits[value - 10]} belas`
  const [scale, name] = scales.find(([base]) => value >= base)!
  const leading = Math.floor(value / scale)
  const rest = value % scale
  const prefix = leading === 1 && (scale === 100 || scale === 1000) ? `se${name}` : `${integerWords(leading)} ${name}`
  return rest ? `${prefix} ${integerWords(rest)}` : prefix
}

function numberWords(value: string): string {
  const [whole, decimals] = value.split(/[.,]/)
  const fraction = decimals?.replace(/0+$/, '')
  const words = integerWords(Number(whole))
  return fraction ? `${words} koma ${Array.from(fraction, (digit) => digits[Number(digit)]).join(' ')}` : words
}

const units = new Map([
  ['kg', 'kilogram'], ['g', 'gram'], ['gr', 'gram'], ['ml', 'mililiter'], ['l', 'liter'],
  ['pouch', 'kemasan'], ['pcs', 'buah'], ['pc', 'buah'],
])

function spokenVariant(variant: string) {
  const normalized = variant.replace(/\b[1-9]\d{0,2}(?:\.\d{3})+(?![\d.])/g, (group) => group.replaceAll('.', ''))
  return normalized.replace(/\b\d+(?:[.,]\d+)?(?:\s*(?:kg|gr|g|ml|l)\b)?/gi, (match) => {
    const [, raw, unit] = /^(\d+(?:[.,]\d+)?)(?:\s*([a-z]+))?$/i.exec(match)!
    const value = Number(raw.replace(',', '.'))
    if (!Number.isSafeInteger(Math.trunc(value))) return match
    return unit ? `${numberWords(raw)} ${units.get(unit.toLowerCase())}` : numberWords(raw)
  })
}

export function priceAnswer({ product, amount, grams }: { product: Product; amount: number; grams?: number }) {
  const name = [productName(product), spokenVariant(product.variant)].filter(Boolean).join(' ')
  const price = `${numberWords(amount.toFixed(2))} rupiah`
  if (grams === undefined) return `${name}, harganya ${price} per ${units.get(product.unit.toLowerCase()) ?? product.unit}.`
  const weight = grams < 1000 ? `${numberWords(String(grams))} gram` : `${numberWords((grams / 1000).toFixed(3))} kilogram`
  return `${name} untuk ${weight}, harganya ${price}.`
}
