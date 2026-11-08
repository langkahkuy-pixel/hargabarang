import { expect, test, type Page } from '@playwright/test'
import { exampleProducts } from './fixtures'

const live = process.env.PW_REAL_DB === '1'

async function openApp(page: Page, search = true) {
  if (!live) {
    const products = exampleProducts()
    await page.route('**/api/store?*', (route) => {
      const params = new URL(route.request().url()).searchParams
      const id = params.get('id')
      const data = params.get('resource') === 'dashboard'
        ? { products, categories: [], changedToday: 0, adminUntil: null }
        : id ? products.find((product) => product.id === id) ?? null : products
      return route.fulfill({ json: data })
    })
  }
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dashboard produk' })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Minyak Goreng Bimoli' })).toHaveCount(2)
  await expect(page.getByText('Modal Rp 38.000')).toHaveCount(0)
  if (search) {
    await page.getByRole('link', { name: 'Cari Harga', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Tanya harga barang' })).toBeVisible()
  }
}

async function query(page: Page, value: string) {
  await page.getByRole('searchbox', { name: 'Cari dengan mengetik' }).fill(value)
  await page.getByRole('button', { name: 'Cari', exact: true }).click()
}

async function mockSpeech(page: Page, mode: 'voice' | 'denied' | 'unsupported' | 'cancel') {
  await page.addInitScript((behavior) => {
    const reads: string[] = []
    Object.assign(window, { __reads: reads })
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: class {
      text: string
      constructor(text: string) { this.text = text }
    } })
    Object.defineProperty(window.speechSynthesis, 'getVoices', { value: () => [{ lang: 'id-ID', localService: true }] })
    Object.defineProperty(window.speechSynthesis, 'speak', { value: (speech: SpeechSynthesisUtterance) => reads.push(speech.text) })
    class Recognition {
      onstart: (() => void) | null = null
      onend: (() => void) | null = null
      onerror: ((event: { error: string }) => void) | null = null
      onresult: ((event: unknown) => void) | null = null
      start() {
        if (behavior === 'denied') {
          setTimeout(() => this.onerror?.({ error: 'not-allowed' }), 40)
          return
        }
        setTimeout(() => this.onstart?.(), 30)
        if (behavior === 'cancel') return
        const result = Object.assign([{ transcript: 'harga minyak Bimoli dua liter berapa' }], { isFinal: true })
        setTimeout(() => {
          this.onresult?.({ results: [result], resultIndex: 0 })
          this.onresult?.({ results: [result], resultIndex: 0 })
        }, 120)
      }
      stop() { this.onend?.() }
      abort() { this.onend?.() }
    }
    for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) {
      Object.defineProperty(window, name, { value: behavior === 'unsupported' ? undefined : Recognition })
    }
  }, mode)
}

test('dashboard terbuka langsung dan pencarian manual membedakan ukuran di viewport Android', async ({ page }) => {
  await mockSpeech(page, 'unsupported')
  await openApp(page)
  await expect(page.getByRole('button', { name: 'Tanya Harga' })).toBeDisabled()
  await query(page, 'minyak bimoli')
  await expect(page.getByRole('heading', { name: 'Pilih barang yang dimaksud' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Hasil harga' })).toHaveCount(0)
  await page.getByRole('button', { name: /2 liter · per pouch/ }).click()
  await expect(page.getByRole('region', { name: 'Hasil harga' })).toContainText('Rp 41.000')
  await query(page, 'kopi imajiner')
  await expect(page.getByRole('heading', { name: 'Barang tidak ditemukan' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(412)
})

test('transkripsi id-ID menghasilkan harga dan satu jawaban suara', async ({ page }) => {
  await mockSpeech(page, 'voice')
  await openApp(page)
  await page.getByRole('button', { name: 'Tanya Harga' }).click()
  await expect(page.getByText('Transkripsi suara')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Hasil harga' })).toContainText('Rp 41.000')
  const reads = await page.evaluate(() => (window as Window & { __reads?: string[] }).__reads)
  expect(reads).toEqual(['Harga Minyak Goreng Bimoli 2 liter, 41000 rupiah per pouch.'])
  await page.getByRole('button', { name: 'Hentikan suara' }).click()
  await expect(page.getByRole('button', { name: 'Bacakan harga' })).toBeVisible()
})

test('izin mikrofon ditolak dan fallback tetap bekerja', async ({ page }) => {
  await mockSpeech(page, 'denied')
  await openApp(page)
  await page.getByRole('button', { name: 'Tanya Harga' }).click()
  await expect(page.getByRole('alert')).toContainText('Izin mikrofon ditolak')
  await query(page, 'gula putih')
  await expect(page.getByRole('region', { name: 'Hasil harga' })).toContainText('Rp 18.500')
})

test('mikrofon dapat dibatalkan dan harga disembunyikan saat offline', async ({ page, context }) => {
  await mockSpeech(page, 'cancel')
  await openApp(page)
  await page.getByRole('button', { name: 'Tanya Harga' }).click()
  await expect(page.getByRole('button', { name: 'Selesai bicara' })).toBeVisible()
  await page.getByRole('button', { name: 'Batalkan' }).click()
  await expect(page.getByRole('button', { name: 'Tanya Harga' })).toBeEnabled()
  await query(page, 'gula putih')
  await expect(page.getByRole('region', { name: 'Hasil harga' })).toBeVisible()
  await context.setOffline(true)
  await expect(page.getByRole('alert')).toContainText('Perangkat offline')
  await expect(page.getByRole('region', { name: 'Hasil harga' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cari', exact: true })).toBeDisabled()
})

test('PIN, CRUD kategori dan produk, audit harga serta penguncian di MariaDB lokal', async ({ page }) => {
  test.skip(!live, 'Jalankan dengan PW_REAL_DB=1 dan database lokal khusus pengujian.')
  test.setTimeout(60_000)
  const pin = process.env.PW_ADMIN_PIN
  if (!pin) throw new Error('Isi PW_ADMIN_PIN dengan PIN khusus pengujian.')
  await openApp(page, false)
  await expect(page.getByRole('button', { name: 'Tambah produk' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Buka mode admin' }).click()
  await page.getByLabel('PIN admin').fill(pin === '000000' ? '111111' : '000000')
  await page.getByRole('button', { name: 'Verifikasi PIN' }).click()
  await expect(page.getByRole('alert')).toContainText('PIN salah')
  await page.getByLabel('PIN admin').fill(pin)
  await page.getByRole('button', { name: 'Verifikasi PIN' }).click()
  await expect(page.getByText('Modal Rp 38.000')).toBeVisible()

  await page.getByRole('button', { name: 'Kelola kategori' }).click()
  await page.getByLabel('Nama kategori', { exact: true }).fill('Bumbu Uji')
  await page.getByRole('button', { name: 'Tambah kategori' }).click()
  await expect(page.getByText('Kategori berhasil ditambahkan.')).toBeVisible()
  await page.getByRole('button', { name: 'Kelola kategori' }).click()
  await page.getByRole('button', { name: 'Edit kategori Bumbu Uji' }).click()
  await page.getByLabel('Ubah nama kategori').fill('Bumbu Dapur Uji')
  await page.getByRole('button', { name: 'Simpan kategori' }).click()
  await expect(page.getByText('Kategori diperbarui.')).toBeVisible()

  await page.getByRole('button', { name: 'Tambah produk' }).click()
  await page.getByLabel('Nama barang').fill('Kecap Manis Uji')
  await page.getByLabel('Satuan').fill('botol')
  await page.getByLabel('Harga jual (Rp)').fill('14000')
  await page.getByLabel('Harga modal (Rp)').fill('10000')
  await page.getByRole('dialog').getByLabel('Kategori', { exact: true }).selectOption({ label: 'Bumbu Dapur Uji' })
  await page.getByRole('button', { name: 'Simpan produk' }).click()
  await expect(page.getByText('Produk berhasil ditambahkan.')).toBeVisible()
  await page.getByLabel('Filter kategori').selectOption({ label: 'Bumbu Dapur Uji' })
  await expect(page.getByRole('listitem')).toHaveCount(1)
  await page.getByRole('button', { name: 'Edit Kecap Manis Uji' }).click()
  await page.getByLabel('Harga jual (Rp)').fill('16000')
  await page.getByRole('button', { name: 'Simpan produk' }).click()
  await expect(page.getByRole('dialog')).toContainText('Rp 14.000')
  await expect(page.getByRole('dialog')).toContainText('Rp 16.000')
  await page.getByRole('button', { name: 'Ya, ubah harga' }).click()
  await page.getByRole('button', { name: 'Riwayat Kecap Manis Uji' }).click()
  await expect(page.getByRole('dialog')).toContainText('Rp 16.000')
  await expect(page.getByRole('dialog')).toContainText('WIB')
  await page.getByRole('button', { name: 'Tutup' }).click()
  await page.getByRole('link', { name: 'Cari Harga' }).click()
  await query(page, 'kecap manis uji')
  await expect(page.getByRole('region', { name: 'Hasil harga' })).toContainText('Rp 16.000')
  await page.getByRole('link', { name: 'Dashboard' }).click()
  await page.getByRole('button', { name: 'Edit Kecap Manis Uji' }).click()
  await page.getByLabel('Produk aktif dan dapat dicari').uncheck()
  await page.getByRole('button', { name: 'Simpan produk' }).click()
  await page.getByLabel('Status produk').selectOption('inactive')
  const product = page.getByRole('listitem').filter({ hasText: 'Kecap Manis Uji' })
  await expect(product).toContainText('Nonaktif')
  await page.getByRole('button', { name: 'Kelola kategori' }).click()
  await page.getByRole('button', { name: 'Hapus kategori Bumbu Dapur Uji' }).click()
  await page.getByRole('button', { name: 'Hapus kategori', exact: true }).click()
  await expect(page.getByText('Kategori berhasil dihapus.')).toBeVisible()
  await expect(product).toBeVisible()
  await expect(product).not.toContainText('Bumbu Dapur Uji')
  await page.getByRole('button', { name: 'Hapus Kecap Manis Uji' }).click()
  await page.getByRole('button', { name: 'Hapus produk', exact: true }).click()
  await expect(product).toHaveCount(0)
  await page.getByRole('button', { name: 'Riwayat harga', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Kecap Manis Uji')
  await page.getByRole('button', { name: 'Tutup' }).click()
  await page.getByRole('button', { name: 'Kunci mode admin' }).click()
  await expect(page.getByRole('button', { name: 'Buka mode admin' })).toBeVisible()
  await expect(page.getByText('Modal Rp 38.000')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  const cachedPaths = await page.evaluate(async () => {
    const shell = (await caches.keys()).find((name) => name.startsWith('asisten-harga-shell-'))
    if (!shell) return []
    return (await (await caches.open(shell)).keys()).map((request) => new URL(request.url).pathname)
  })
  expect(cachedPaths).toContain('/index.html')
  expect(cachedPaths.some((path) => path.startsWith('/api/'))).toBe(false)
})
