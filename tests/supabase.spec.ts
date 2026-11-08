import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const url = process.env.PW_SUPABASE_URL
const publicKey = process.env.PW_SUPABASE_PUBLIC_KEY
const adminKey = process.env.PW_SUPABASE_SERVICE_KEY

async function login(page: Page, email: string, password: string) {
  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Kata sandi').fill(password)
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Tanya harga barang' })).toBeVisible()
}

async function search(page: Page, query: string) {
  await page.getByRole('searchbox', { name: 'Cari dengan mengetik' }).fill(query)
  await page.getByRole('button', { name: 'Cari', exact: true }).click()
}

test('Supabase lokal: Auth, katalog, audit, isolasi toko, dan PWA', async ({ page, context }) => {
  test.setTimeout(60_000)
  if (!url || !publicKey || !adminKey || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
    throw new Error('Pengujian integrasi hanya menerima alamat dan kunci Supabase lokal.')
  }
  const auth = { persistSession: false, autoRefreshToken: false }
  const admin = createClient(url, adminKey, { auth })
  const anonymous = createClient(url, publicKey, { auth })
  const storeId = randomUUID()
  const otherStoreId = randomUUID()
  const suffix = storeId.slice(0, 8)
  const password = `uji-${randomUUID()}`
  const users: string[] = []
  const data = <T extends { data: unknown; error: { message: string } | null }>(result: T): T['data'] => {
    if (result.error) throw new Error(result.error.message)
    return result.data
  }

  async function member(role: 'owner' | 'staff', store: string, label: string) {
    const email = `${label}-${suffix}@test.example`
    const { user } = data(await admin.auth.admin.createUser({ email, password, email_confirm: true }))
    if (!user) throw new Error('Akun uji gagal dibuat.')
    users.push(user.id)
    data(await admin.from('profiles').insert({ user_id: user.id, store_id: store, role }))
    return { email, id: user.id }
  }

  async function client(email: string) {
    const connected = createClient(url!, publicKey!, { auth })
    data(await connected.auth.signInWithPassword({ email, password }))
    return connected
  }

  try {
    data(await admin.from('stores').insert([
      { id: storeId, name: 'Toko Integrasi' }, { id: otherStoreId, name: 'Toko Lain' },
    ]))
    const owner = await member('owner', storeId, 'owner')
    const staff = await member('staff', storeId, 'staff')
    const otherOwner = await member('owner', otherStoreId, 'other')
    expect((await anonymous.from('products').select('*')).error).toBeTruthy()
    const signup = await anonymous.auth.signUp({ email: `blocked-${suffix}@test.example`, password })
    if (signup.data.user) users.push(signup.data.user.id)
    expect(signup.error).toMatchObject({ code: 'signup_disabled' })
    await login(page, owner.email, password)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Tanya harga barang' })).toBeVisible()
    await page.getByRole('link', { name: 'Dashboard' }).click()
    await expect(page.getByText('Belum ada produk')).toBeVisible()
    await page.getByRole('button', { name: 'Tambah produk' }).click()
    await page.getByLabel('Nama barang').fill('Tepung')
    await page.getByLabel('Merek').fill('Lestari')
    await page.getByLabel('Varian / ukuran').fill('500 gram')
    await page.getByLabel('Satuan').fill('bungkus')
    await page.getByLabel('Harga jual (Rp)').fill('14000')
    await page.getByLabel('Harga modal (Rp)').fill('12000')
    await page.getByRole('button', { name: 'Simpan produk' }).click()
    await expect(page.getByText('Modal Rp 12.000')).toBeVisible()
    await page.getByRole('button', { name: 'Edit Tepung Lestari 500 gram' }).click()
    await page.getByLabel('Harga jual (Rp)').fill('15000')
    await page.getByRole('button', { name: 'Simpan produk' }).click()
    await page.getByRole('button', { name: 'Ya, ubah harga' }).click()
    await page.getByRole('button', { name: 'Riwayat Tepung Lestari 500 gram' }).click()
    await expect(page.getByRole('dialog')).toContainText('Rp 14.000')
    await expect(page.getByRole('dialog')).toContainText('Rp 15.000')
    await page.getByRole('button', { name: 'Tutup' }).click()
    await expect(page.locator('.metric').filter({ hasText: 'Produk berubah harga hari ini' }).locator('strong')).toHaveText('1')
    await page.getByRole('link', { name: 'Cari Harga' }).click()
    await search(page, 'tepung lestari setengah kilo')
    await expect(page.getByRole('region', { name: 'Hasil harga' })).toContainText('Rp 15.000')
    const product = data(await admin.from('products').select('id').eq('store_id', storeId).single())
    if (!product) throw new Error('Produk uji gagal ditemukan.')
    expect(data(await admin.from('price_history').select('old_price,new_price,changed_by').eq('store_id', storeId)))
      .toEqual([{ old_price: 14000, new_price: 15000, changed_by: owner.id }])
    const staffClient = await client(staff.email)
    expect(data(await staffClient.from('products').select('*').eq('id', product.id)))
      .toMatchObject([{ sale_price: 15000 }])
    expect(data(await staffClient.from('product_costs').select('*'))).toEqual([])
    expect(data(await staffClient.from('price_history').select('*'))).toEqual([])
    expect(data(await staffClient.from('products').update({ sale_price: 1 }).eq('id', product.id).select('id'))).toEqual([])
    const otherClient = await client(otherOwner.email)
    expect(data(await otherClient.from('products').select('*').eq('id', product.id))).toEqual([])
    expect(data(await otherClient.from('product_costs').select('*').eq('product_id', product.id))).toEqual([])
    await page.getByRole('button', { name: 'Keluar' }).click()
    await expect(page.getByRole('heading', { name: 'Masuk ke toko' })).toBeVisible()
    await login(page, staff.email, password)
    await expect(page.getByRole('link', { name: 'Dashboard' })).toHaveCount(0)
    await page.goto('/#dashboard')
    await expect(page.getByRole('heading', { name: 'Tanya harga barang' })).toBeVisible()
    await search(page, 'tepung lestari')
    await expect(page.getByRole('region', { name: 'Hasil harga' })).toContainText('Rp 15.000')
    await page.route('**/rest/v1/products?*', (route) => route.fulfill({
      status: 500, json: { message: 'Uji kegagalan data', code: 'TEST' },
    }))
    await search(page, 'tepung lestari')
    await expect(page.getByRole('alert')).toContainText('Harga gagal dimuat')
    await expect(page.getByRole('region', { name: 'Hasil harga' })).toHaveCount(0)
    await page.unroute('**/rest/v1/products?*')

    const manifest = await page.request.get('/manifest.webmanifest')
    expect(await manifest.json()).toMatchObject({ display: 'standalone', lang: 'id-ID' })
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
    const cachedPaths = await page.evaluate(async () => {
      const name = (await caches.keys()).find((entry) => entry.startsWith('asisten-harga-shell-'))
      if (!name) return []
      return (await (await caches.open(name)).keys()).map((entry) => new URL(entry.url).pathname)
    })
    expect(cachedPaths).toEqual(expect.arrayContaining(['/index.html', '/icon-192.png', '/icon-512.png']))
    expect(cachedPaths.every((path) => !path.includes('/rest/') && !path.includes('/auth/'))).toBe(true)
    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('alert')).toContainText('Perangkat offline')
    await expect(page.getByRole('region', { name: 'Hasil harga' })).toHaveCount(0)
  } finally {
    for (const table of ['price_history', 'product_costs', 'products', 'profiles']) {
      data(await admin.from(table).delete().in('store_id', [storeId, otherStoreId]))
    }
    for (const user of users) data(await admin.auth.admin.deleteUser(user))
    data(await admin.from('stores').delete().in('id', [storeId, otherStoreId]))
  }
})
