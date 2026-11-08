import { readFile } from 'node:fs/promises'
import type { Pool } from 'mariadb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRepository, createStorePool, type StoreRepository } from '../server/repository'
import { draft } from './fixtures'

const database = process.env.MARIADB_TEST_DATABASE
let pool: Pool
let store: StoreRepository
let ownsTables = false

describe.skipIf(!database)('MariaDB nyata', () => {
  beforeAll(async () => {
    if (!database || !/^asisten_harga_test(?:_[a-z0-9]+)?$/.test(database)) {
      throw new Error('Gunakan database kosong khusus tes dengan nama asisten_harga_test atau asisten_harga_test_<suffix>.')
    }
    pool = createStorePool({ ...process.env, MARIADB_DATABASE: database })
    const tables = await pool.query<unknown[]>('SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()')
    if (tables.length) throw new Error('Database pengujian harus kosong.')
    ownsTables = true
    for (const path of ['db/schema.sql', 'db/seed.sql']) {
      const sql = await readFile(path, 'utf8')
      for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) await pool.query(statement)
    }
    store = createRepository(pool)
  }, 30_000)

  afterAll(async () => {
    if (!pool) return
    try {
      if (ownsTables) await pool.query('DROP TABLE IF EXISTS price_history, products, categories, admin_pin_attempts')
    } finally {
      await pool.end()
    }
  }, 15_000)

  it('menjalankan katalog, kategori, perubahan harga atomik dan penghapusan dengan riwayat', async () => {
    expect(await store.searchCatalog()).toHaveLength(6)
    const publicCatalog = await store.dashboard(null)
    expect(publicCatalog).not.toHaveProperty('costs')
    const item = publicCatalog.products.find((product) => product.sku === 'MYK-002')
    expect(item).toMatchObject({ sale_price: 41000, aliases: ['minyak bimoli'], stock_qty: null, revision: 1 })
    expect(item).not.toHaveProperty('cost_price')
    expect((await store.dashboard(1)).costs?.[item!.id]).toBe(38000)

    const categoryId = await store.saveCategory('Uji kategori', null)
    await store.saveCategory('Kategori pindah', categoryId)
    expect((await store.dashboard(1)).categories).toContainEqual({ id: categoryId, name: 'Kategori pindah' })
    await expect(store.saveCategory('kategori pindah', null)).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' })
    const id = await store.saveProduct({ ...draft, category_id: categoryId }, null)
    expect(await store.activeProduct(id)).toMatchObject({ sale_price: 14000, category_id: categoryId, revision: 1 })
    await expect(store.saveProduct({ ...draft, sku: 'kcp-001' }, null)).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' })
    const results = await Promise.allSettled([15000.25, 16000.5].map((price) =>
      store.saveProduct({ ...draft, category_id: categoryId, sale_price: price }, { id, revision: 1 })))
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: 'PRODUCT_CHANGED' } })
    const current = (await store.activeProduct(id))!
    expect(current.revision).toBe(2)
    expect(current.updated_at).toMatch(/Z$/)
    expect(await store.history(id)).toMatchObject([{
      product_id: id, product_label: 'Kecap manis Lestari 500 ml', old_price: 14000, new_price: current.sale_price,
    }])
    expect((await store.dashboard(1)).changedToday).toBe(1)
    await store.deleteCategory(categoryId)
    expect((await store.activeProduct(id))?.category_id).toBeNull()
    await store.saveProduct({ ...draft, sale_price: current.sale_price, is_active: false }, { id, revision: 2 })
    expect(await store.activeProduct(id)).toBeNull()
    expect((await store.dashboard(null)).products.some((product) => product.id === id)).toBe(false)
    expect((await store.dashboard(1)).products.some((product) => product.id === id)).toBe(true)
    await store.deleteProduct(id, 3)
    expect((await store.dashboard(1)).products.some((product) => product.id === id)).toBe(false)
    expect(await store.history(id)).toHaveLength(1)
    await expect(store.saveProduct(draft, null)).resolves.not.toBe(id)
  })

  it('membatasi percobaan PIN secara atomik pada koneksi bersamaan', async () => {
    const attempts = await Promise.all(Array.from({ length: 15 }, () => store.reservePinAttempt()))
    expect(attempts.filter(Boolean)).toHaveLength(10)
    expect(await store.reservePinAttempt()).toBe(false)
  })
})
