import { productName, type Product } from './catalog'

const fillers = new Set('harga berapa berapaan harganya cek cari tolong dong ya apakah apa yang untuk merek kemasan saya mau tahu jual rupiah per'.split(' '))
const digits: Record<string, number> = {
  nol: 0, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9,
}
const digit = (word: string) => Object.hasOwn(digits, word) ? digits[word] : undefined
const specialNumbers = new Map([['sepuluh', 10], ['sebelas', 11], ['seratus', 100], ['seribu', 1000]])
const scales = new Map([['puluh', 10], ['ratus', 100], ['ribu', 1000]])
const sizes: Record<string, [string, number]> = {
  kg: ['g', 1000], kilo: ['g', 1000], kilogram: ['g', 1000], gram: ['g', 1], gr: ['g', 1], g: ['g', 1],
  liter: ['ml', 1000], litre: ['ml', 1000], l: ['ml', 1000], mililiter: ['ml', 1], ml: ['ml', 1],
  pcs: ['buah', 1], pc: ['buah', 1], buah: ['buah', 1], butir: ['buah', 1],
  pak: ['pak', 1], pack: ['pak', 1], bungkus: ['bungkus', 1], botol: ['botol', 1], dus: ['dus', 1], kotak: ['kotak', 1],
}

function numberWords(words: string[]): number | undefined {
  if (words.length === 0) return undefined
  if (words.length === 1 && /^\d+(?:\.\d+)?$/.test(words[0])) return Number(words[0])
  const comma = words.indexOf('koma')
  if (comma > 0) {
    const fraction = words.slice(comma + 1).map((word) => digit(word) ?? (/^\d$/.test(word) ? Number(word) : undefined))
    const whole = numberWords(words.slice(0, comma))
    return whole !== undefined && fraction.length && fraction.every((digit) => digit !== undefined)
      ? Number(`${whole}.${fraction.join('')}`) : undefined
  }
  const last = words.at(-1)
  if (last === 'setengah') {
    const whole = words.length === 1 ? 0 : numberWords(words.slice(0, -1))
    return whole === undefined ? undefined : whole + 0.5
  }
  const [first, second] = words
  const leading = digit(first)
  if (words.length === 1) return specialNumbers.get(first) ?? leading
  if (words.length === 2 && second === 'belas' && leading !== undefined && leading > 1) return 10 + leading
  const scale = scales.get(second)
  if (scale && leading) {
    const remainder = words.length === 2 ? 0 : numberWords(words.slice(2))
    return remainder !== undefined && remainder < scale ? leading * scale + remainder : undefined
  }
  const prefix = first === 'seratus' || first === 'seribu' ? specialNumbers.get(first) : undefined
  if (prefix) {
    const remainder = numberWords(words.slice(1))
    return remainder !== undefined && remainder < prefix ? prefix + remainder : undefined
  }
  return undefined
}

export function searchTokens(input: string): string[] {
  const tokens = input.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/(\d)[,.](\d)/g, '$1.$2')
    .match(/\d+(?:\.\d+)?|[\p{L}]+/gu) ?? []
  const words = tokens.filter((token) => !fillers.has(token))
  const result: string[] = []

  for (const word of words) {
    if (!Object.hasOwn(sizes, word)) {
      result.push(word)
      continue
    }
    const [unit, multiplier] = sizes[word]
    for (let length = Math.min(8, result.length); length > 0; length--) {
      const quantity = numberWords(result.slice(-length))
      if (quantity === undefined) continue
      result.splice(-length, length, `${Number((quantity * multiplier).toFixed(8))}:${unit}`)
      break
    }
    result.push(unit)
  }

  return [...new Set(result)]
}

function oneEdit(left: string, right: string) {
  if (left.length > right.length) return oneEdit(right, left)
  if (!/^[a-z]{4,}$/.test(left) || !/^[a-z]{4,}$/.test(right) || right.length - left.length > 1) return false
  const index = [...left].findIndex((letter, position) => letter !== right[position])
  if (index < 0) return true
  return left.length === right.length
    ? left.slice(index + 1) === right.slice(index + 1)
      || (left[index] === right[index + 1] && left[index + 1] === right[index] && left.slice(index + 2) === right.slice(index + 2))
    : left.slice(index) === right.slice(index + 1)
}

const cleanSku = (value: string) => value.trim().toLowerCase()
export type Match = { kind: 'empty' | 'missing' } | { kind: 'found'; product: Product } | { kind: 'choices'; products: Product[] }

export function matchProducts(catalog: Product[], query: string, alternatives: string[] = []): Match {
  const phrases = [query, ...alternatives].map((raw) => ({ raw, tokens: searchTokens(raw) })).filter(({ tokens }) => tokens.length)
  if (!phrases.length) return { kind: 'empty' }
  const voice = alternatives.length > 0
  const matches = catalog.filter((product) => {
    if (!product.is_active) return false
    const standard = searchTokens([product.name, product.brand, product.variant, product.unit].join(' '))
    const sku = product.sku
    const names = [standard, ...product.aliases.map((alias) => [...standard, ...searchTokens(alias)])]
    return phrases.some(({ raw, tokens }) => {
      if (sku && cleanSku(sku) === cleanSku(raw)) return true
      return names.some((name) => {
        const unmatched = tokens.filter((token) => !name.includes(token))
        return !unmatched.length
          || (voice && unmatched.length === 1 && name.some((token) => oneEdit(unmatched[0], token)))
      })
    })
  })
  if (!matches.length) return { kind: 'missing' }
  if (matches.length === 1) {
    const product = matches[0]
    // A speech alternative or approximate spelling may suggest a product, but needs a tap.
    const first = phrases[0]
    const standard = [product.name, product.brand, product.variant, product.unit].join(' ')
    const isExact = (product.sku && cleanSku(product.sku) === cleanSku(query))
      || (first.raw === query && ['', ...product.aliases].some((alias) => {
        const name = [...searchTokens(standard), ...searchTokens(alias)]
        return first.tokens.every((token) => name.includes(token))
      }))
    if (isExact) return { kind: 'found', product }
  }
  return { kind: 'choices', products: matches.sort((left, right) =>
    productName(left).localeCompare(productName(right), 'id') || left.variant.localeCompare(right.variant, 'id', { numeric: true })) }
}
