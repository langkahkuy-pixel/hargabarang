import { describe, expect, it } from 'vitest'
import { startOfStoreDay } from '../shared/store'
import { parseAmount } from '../src/catalog'
import { exampleProducts } from './fixtures'
import { matchProducts, searchTokens } from '../src/search'
import { weightPrice } from '../src/weight-price'

const products = exampleProducts()
describe('Pencocokan katalog', () => {
  it('menormalkan kalimat, angka, satuan, dan ejaan dengan aksen', () => {
    for (const text of ['harga minyak Bimoli dua liter berapa', 'minyak Bímoli 2L', 'Bimoli 2000 ml']) {
      expect(matchProducts(products, text)).toMatchObject({ kind: 'found', product: { sale_price: 41000 } })
    }
    expect(searchTokens('dua ratus lima puluh gram')).toEqual(['250:g', 'g'])
    expect(searchTokens('satu koma lima kilogram')).toEqual(['1500:g', 'g'])
    expect(searchTokens('setengah kilo')).toEqual(['500:g', 'g'])
  })

  it('mencocokkan SKU, alias, dan satuan jual', () => {
    expect(matchProducts(products, ' myk-002 ')).toMatchObject({ kind: 'found', product: { sku: 'MYK-002' } })
    expect(matchProducts(products, 'gula putih bungkus')).toMatchObject({ kind: 'found', product: { name: 'Gula Pasir' } })
    expect(matchProducts(products, 'Mi goreng per dus')).toEqual({ kind: 'missing' })
  })

  it('meminta pilihan bila ukuran ambigu dan tidak mengabaikan ukuran yang salah', () => {
    expect(matchProducts(products, 'minyak Bimoli')).toMatchObject({ kind: 'choices', choices: [{ product: { variant: '1 liter' } }, { product: { variant: '2 liter' } }] })
    expect(matchProducts(products, 'minyak Bimoli tiga liter')).toEqual({ kind: 'missing' })
  })

  it('menawarkan nama serupa dan alternatif suara tanpa langsung membacakan harga', () => {
    const similar = { ...products[1], id: 'other', brand: 'Bimoly', aliases: [] }
    expect(matchProducts([...products, similar], 'minyak Bimoli 2L', ['minyak Bimoli 2L'])).toMatchObject({
      kind: 'choices', choices: [{ product: { brand: 'Bimoli' } }, { product: { brand: 'Bimoly' } }],
    })
    expect(matchProducts(products, 'gula putih 2 kg', ['gula putih 2 kg', 'gula putih 1 kg'])).toMatchObject({
      kind: 'choices', choices: [{ product: { name: 'Gula Pasir' } }],
    })
  })

  it('menangani katalog kosong, produk nonaktif, dan kalimat tanpa nama', () => {
    expect(matchProducts([], 'beras')).toEqual({ kind: 'missing' })
    expect(matchProducts([{ ...products[0], is_active: false }], 'Bimoli')).toEqual({ kind: 'missing' })
    expect(matchProducts(products, 'tolong cek harga')).toEqual({ kind: 'empty' })
  })
})

describe('Harga curah', () => {
  const sugar = { ...products[2], id: 'curah', brand: '', name: 'Gula Pasir Curah', variant: '', unit: 'kg', weight_rounding: 1000 }
  it.each([
    ['gula pasir satu ons', 100, 2000],
    ['dua ons gula pasir', 200, 4000],
    ['gula pasir 3ons', 300, 6000],
    ['harga gula pasir setengah kilo', 500, 10000],
    ['gula pasir 1/2 kg', 500, 10000],
    ['gula pasir 0,5 kg', 500, 10000],
    ['gula pasir curah 1.000 gram', 1000, 18500],
    ['gula pasir dua kilo', 2000, 37000],
    ['gula pasir tiga kilo', 3000, 55500],
  ])('menghitung %s', (query, grams, amount) => {
    expect(matchProducts([...products, sugar], query)).toMatchObject({ kind: 'found', product: { id: sugar.id }, grams })
    expect(weightPrice(sugar, grams).amount).toBe(amount)
  })

  it('memakai harga proporsional tanpa pembulatan dan menolak berat yang tidak jelas', () => {
    expect(weightPrice({ ...sugar, weight_rounding: 0 }, 500)).toEqual({ amount: 9250, rounded: false })
    expect(weightPrice({ ...sugar, sale_price: 20000 }, 500)).toEqual({ amount: 10000, rounded: false })
    for (const query of ['gula pasir 0 kg', 'gula pasir -1 kg', 'gula pasir 1 ons atau 2 ons', 'setengah kilo']) {
      expect(matchProducts([sugar], query)).toEqual({ kind: 'missing' })
    }
    expect(matchProducts(products, 'Gulaku dua ons')).toEqual({ kind: 'missing' })
  })

  it('meminta pilihan ketika alternatif suara mengubah berat', () => {
    expect(matchProducts([sugar], 'gula pasir dua ons', ['gula pasir tiga ons'])).toMatchObject({
      kind: 'choices', choices: [{ grams: 200 }, { grams: 300 }],
    })
  })

  it('meminta pilihan jika kemasan dan curah sama-sama cocok', () => {
    expect(matchProducts([...products, sugar], 'gula pasir satu kilo')).toMatchObject({
      kind: 'choices', choices: expect.arrayContaining([
        expect.objectContaining({ product: expect.objectContaining({ brand: 'Gulaku' }) }),
        expect.objectContaining({ product: expect.objectContaining({ id: sugar.id }), grams: 1000 }),
      ]),
    })
  })
})

describe('Nilai katalog', () => {
  it('menerima nol dan desimal lokal serta menolak nilai di luar format database', () => {
    expect(parseAmount('', 'Modal')).toBeNull()
    expect(parseAmount('0', 'Harga jual', true)).toBe(0)
    expect(parseAmount('29,50', 'Harga jual', true)).toBe(29.5)
    for (const invalid of ['', '-5', '1.000', '10000000000', '1e3', 'NaN']) {
      expect(() => parseAmount(invalid, 'Harga jual', true)).toThrow()
    }
  })

  it('menghitung pergantian hari toko menurut WIB', () => {
    expect(startOfStoreDay(new Date('2026-11-08T16:59:59Z'))).toBe('2026-11-07T17:00:00.000Z')
    expect(startOfStoreDay(new Date('2026-11-08T17:00:00Z'))).toBe('2026-11-08T17:00:00.000Z')
  })
})
