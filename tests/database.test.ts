import { readFile } from 'node:fs/promises'
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const owner = '1a000000-0000-4000-8000-000000000001'
const staff = '1a000000-0000-4000-8000-000000000002'
const otherOwner = '1a000000-0000-4000-8000-000000000003'
const unassigned = '1a000000-0000-4000-8000-000000000004'
const store = '7d292361-2eb3-447b-93a8-26be9aa88880'
const otherStore = '2a000000-0000-4000-8000-000000000001'
const product = '139e0fb4-479f-4fae-a290-561f8176c002'
let db: PGlite

beforeAll(async () => {
  db = await PGlite.create()
  // Only the Supabase auth identity primitives are stubbed. PostgreSQL runs the migration and RLS.
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
  `)
  await db.exec(await readFile('supabase/migrations/20261108000100_initial_catalog.sql', 'utf8'))
  await db.exec(await readFile('supabase/seed.sql', 'utf8'))
  await db.exec(`
    insert into auth.users values ('${owner}'), ('${staff}'), ('${otherOwner}'), ('${unassigned}');
    insert into public.stores (id, name) values ('${otherStore}', 'Toko lain');
    insert into public.profiles values ('${owner}', '${store}', 'owner'), ('${staff}', '${store}', 'staff'),
      ('${otherOwner}', '${otherStore}', 'owner');
  `)
})

afterAll(async () => { await db?.close() })

function asUser<T>(user: string | null, run: (tx: Transaction) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec(user ? 'set local role authenticated' : 'set local role anon')
    if (user) await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [user])
    const result = await run(tx)
    await tx.rollback()
    return result
  })
}

const save = (tx: Transaction, id: string | null, storeId: string, sku: string, price: number, cost: number | null, expected: number | null) =>
  tx.query<{ id: string }>(
    "select public.save_product($1, $2, 'Minyak Goreng', 'Bimoli', '2 liter', 'pouch', $3, '{}', $4, 16, true, $5, $6) as id",
    [id, storeId, sku, price, cost, expected],
  )

describe('RLS, transaksi katalog, dan audit harga', () => {
  it.each(['stores', 'profiles', 'products', 'product_costs', 'price_history'])('menolak akses anon ke %s', async (table) => {
    await expect(asUser(null, (tx) => tx.query(`select * from public.${table}`))).rejects.toMatchObject({ code: '42501' })
  })

  it('menolak akses katalog pengguna tanpa profil dan membatasi profil ke pemilik akun', async () => {
    await asUser(unassigned, async (tx) => expect((await tx.query('select * from public.products')).rows).toEqual([]))
    await asUser(owner, async (tx) => {
      expect((await tx.query('select user_id from public.profiles')).rows).toEqual([{ user_id: owner }])
      expect((await tx.query('select id from public.stores')).rows).toEqual([{ id: store }])
    })
    await expect(asUser(staff, (tx) => tx.query("update public.profiles set role = 'owner'"))).rejects.toMatchObject({ code: '42501' })
  })

  it('memberi staff harga jual tanpa data modal atau izin tulis', async () => {
    await asUser(staff, async (tx) => {
      const rows = (await tx.query('select * from public.products')).rows
      expect(rows).toHaveLength(6)
      expect(rows[0]).not.toHaveProperty('cost_price')
      expect((await tx.query('select * from public.product_costs')).rows).toEqual([])
      expect((await tx.query('select * from public.price_history')).rows).toEqual([])
      expect((await tx.query('update public.products set sale_price = 1 returning id')).rows).toEqual([])
    })
    await expect(asUser(staff, (tx) => save(tx, product, store, 'MYK-002', 45000, 38000, 41000)))
      .rejects.toMatchObject({ code: '42501' })
    await expect(asUser(staff, (tx) => tx.query(
      'insert into public.product_costs (store_id, product_id, cost_price) values ($1, $2, 100)', [store, product],
    ))).rejects.toMatchObject({ code: '42501' })
  })

  it('mengisolasi data dan penulisan antar toko', async () => {
    await asUser(otherOwner, async (tx) => {
      expect((await tx.query('select id from public.stores')).rows).toEqual([{ id: otherStore }])
      for (const table of ['products', 'product_costs', 'price_history']) {
        expect((await tx.query(`select * from public.${table} where store_id = $1`, [store])).rows).toEqual([])
      }
      expect((await tx.query('update public.products set sale_price = 1 where id = $1 returning id', [product])).rows).toEqual([])
      expect((await save(tx, null, otherStore, 'MYK-002', 45000, null, null)).rows).toHaveLength(1)
    })
    await expect(asUser(otherOwner, (tx) => save(tx, product, store, 'MYK-002', 45000, null, 41000)))
      .rejects.toMatchObject({ code: '42501' })
    await expect(asUser(otherOwner, (tx) => tx.query(
      "insert into public.products (store_id, name, unit, sale_price) values ($1, 'Gula', 'kg', 1)", [store],
    ))).rejects.toMatchObject({ code: '42501' })
  })

  it('mencatat tepat satu perubahan harga, identitas pengguna, dan waktu server', async () => {
    await asUser(owner, async (tx) => {
      expect((await tx.query('select * from public.product_costs')).rows).toHaveLength(1)
      await save(tx, product, store, 'MYK-002', 45000, 39000, 41000)
      await save(tx, product, store, 'MYK-002', 45000, null, 45000)
      expect((await tx.query('select * from public.product_costs')).rows).toEqual([])
      const history = (await tx.query<{ changed_at: Date }>('select * from public.price_history')).rows
      expect(history).toHaveLength(1)
      expect(history[0]).toMatchObject({
        product_id: product, store_id: store, old_price: '41000.00', new_price: '45000.00', changed_by: owner,
      })
      expect(history[0].changed_at.getTime()).toBeGreaterThan(Date.now() - 15000)
    })
  })

  it('mencegah penimpaan harga yang berubah sejak konfirmasi serta memvalidasi SKU', async () => {
    await expect(asUser(owner, (tx) => save(tx, product, store, 'MYK-002', 43000, null, 40000)))
      .rejects.toMatchObject({ code: '40001' })
    await expect(asUser(owner, (tx) => save(tx, null, store, '  myk-002 ', 43000, null, null)))
      .rejects.toMatchObject({ code: '23505' })
  })

  it('membatalkan harga dan audit bila penyimpanan modal gagal', async () => {
    await expect(asUser(owner, (tx) => save(tx, product, store, 'MYK-002', 43000, -1, 41000)))
      .rejects.toMatchObject({ code: '23514' })
    await asUser(owner, async (tx) => {
      expect((await tx.query('select sale_price from public.products where id = $1', [product])).rows).toEqual([{ sale_price: '41000.00' }])
      expect((await tx.query('select * from public.price_history')).rows).toEqual([])
    })
  })

  it('menolak pemalsuan waktu produk serta penulisan atau penghapusan audit langsung', async () => {
    await expect(asUser(owner, (tx) => tx.query("update public.products set updated_at = '2000-01-01'")))
      .rejects.toMatchObject({ code: '42501' })
    await expect(asUser(owner, (tx) => tx.query('insert into public.price_history default values')))
      .rejects.toMatchObject({ code: '42501' })
    await expect(asUser(owner, (tx) => tx.query('delete from public.price_history')))
      .rejects.toMatchObject({ code: '42501' })
  })
})
