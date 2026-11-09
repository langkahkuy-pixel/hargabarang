import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { exampleBackup } from './fixtures'

async function chooseBackup(page: Page, data: unknown) {
  await page.getByLabel('Pilih file cadangan JSON').setInputFiles({
    name: 'cadangan.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)),
  })
}

async function openApp(page: Page, search = true, backup = exampleBackup()) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dashboard produk' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Belum ada produk' })).toBeVisible()
  await page.getByRole('button', { name: 'Cadangan data' }).click()
  await chooseBackup(page, backup)
  await expect(page.getByText('Cadangan valid.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Ganti data dengan cadangan' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Minyak Goreng Bimoli' })).toHaveCount(2)
  if (search) {
    await page.getByRole('link', { name: 'Cari Harga', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Tanya harga barang' })).toBeVisible()
  }
}

async function query(page: Page, value: string) {
  await page.getByRole('searchbox', { name: 'Cari dengan mengetik' }).fill(value)
  await page.getByRole('button', { name: 'Cari', exact: true }).click()
}

async function mockSpeech(page: Page, mode: 'voice' | 'denied' | 'unsupported' | 'cancel', transcript = 'harga minyak Bimoli dua liter berapa', nativeVoice = true) {
  await page.addInitScript(({ behavior, phrase, native }) => {
    const reads: string[] = []
    Object.assign(window, { __reads: reads })
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: class {
      text: string
      constructor(text: string) { this.text = text }
    } })
    Object.defineProperty(window.speechSynthesis, 'getVoices', { value: () => native ? [{ lang: 'id-ID', localService: true }] : [] })
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
        const result = Object.assign([{ transcript: phrase }], { isFinal: true })
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
  }, { behavior: mode, phrase: transcript, native: nativeVoice })
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
  expect(reads).toEqual(['Minyak Goreng Bimoli dua liter, harganya empat puluh satu ribu rupiah per kemasan.'])
  await page.getByRole('button', { name: 'Hentikan suara' }).click()
  await expect(page.getByRole('button', { name: 'Bacakan harga' })).toBeVisible()
})

test('hasil suara otomatis diputar dengan mesin lokal saat suara bawaan tidak tersedia', async ({ page }) => {
  await mockSpeech(page, 'voice', 'harga minyak Bimoli dua liter berapa', false)
  await page.addInitScript(() => {
    const start = AudioBufferSourceNode.prototype.start
    AudioBufferSourceNode.prototype.start = function (...args) {
      start.apply(this, args)
      if (this.buffer?.getChannelData(0).some((sample) => Math.abs(sample) > 0.001)) {
        Object.assign(window, { __spokenDuration: this.buffer.duration })
      }
    }
  })
  await openApp(page)
  await page.getByRole('button', { name: 'Tanya Harga' }).click()
  await expect(page.getByRole('region', { name: 'Hasil harga' })).toContainText('Rp 41.000')
  await expect.poll(() => page.evaluate(() => (window as Window & { __spokenDuration?: number }).__spokenDuration ?? 0))
    .toBeGreaterThan(1)
  await page.getByRole('button', { name: 'Hentikan suara' }).click()
  await expect(page.getByRole('button', { name: 'Bacakan harga' })).toBeVisible()
})

test('pengaturan harga curah tersimpan dan dipakai oleh pencarian teks serta suara', async ({ page }) => {
  await mockSpeech(page, 'voice', 'harga gula pasir setengah kilo')
  await openApp(page, false)
  await page.getByRole('button', { name: 'Tambah produk' }).click()
  await page.getByLabel('Nama barang').fill('Gula Pasir Curah')
  await page.getByLabel('Jual curah berdasarkan berat').check()
  await page.getByLabel('Harga jual per kg (Rp)').fill('18500')
  await page.getByLabel('Pembulatan ke atas (Rp)').fill('1000')
  await page.getByRole('button', { name: 'Simpan produk' }).click()
  await expect(page.getByText('Produk berhasil ditambahkan.')).toBeVisible()
  await page.reload()
  await page.getByRole('link', { name: 'Cari Harga', exact: true }).click()
  await page.getByRole('button', { name: 'Tanya Harga' }).click()
  const result = page.getByRole('region', { name: 'Hasil harga' })
  await expect(result).toContainText('500 gram · Rp 18.500 per kg')
  await expect(result).toContainText('Rp 10.000')
  await expect(result).toContainText('Dibulatkan ke atas')
  expect(await page.evaluate(() => (window as Window & { __reads?: string[] }).__reads))
    .toEqual(['Gula Pasir Curah untuk lima ratus gram, harganya sepuluh ribu rupiah.'])
  await query(page, 'gula pasir dua kilo')
  await expect(result).toContainText('Rp 37.000')
  await query(page, 'gula pasir dua ons')
  await expect(result).toContainText('Rp 4.000')
  await page.getByRole('link', { name: 'Dashboard' }).click()
  await page.getByRole('button', { name: 'Edit Gula Pasir Curah' }).click()
  await page.getByLabel('Harga jual per kg (Rp)').fill('22500')
  await page.getByRole('button', { name: 'Simpan produk' }).click()
  await page.getByRole('button', { name: 'Ya, ubah harga' }).click()
  await expect(page.getByText('Perubahan produk tersimpan.')).toBeVisible()
  await page.getByRole('link', { name: 'Cari Harga', exact: true }).click()
  await query(page, 'gula pasir dua kilo')
  await expect(result).toContainText('Rp 45.000')
})

test('izin mikrofon ditolak dan fallback tetap bekerja', async ({ page }) => {
  await mockSpeech(page, 'denied')
  await openApp(page)
  await page.getByRole('button', { name: 'Tanya Harga' }).click()
  await expect(page.getByRole('alert')).toContainText('Izin mikrofon ditolak')
  await query(page, 'gula putih')
  await expect(page.getByRole('region', { name: 'Hasil harga' })).toContainText('Rp 18.500')
})

test('mikrofon dapat dibatalkan dan harga tersedia setelah muat ulang offline', async ({ page, context }) => {
  await mockSpeech(page, 'cancel')
  await openApp(page)
  await page.getByRole('button', { name: 'Tanya Harga' }).click()
  await expect(page.getByRole('button', { name: 'Selesai bicara' })).toBeVisible()
  await page.getByRole('button', { name: 'Batalkan' }).click()
  await expect(page.getByRole('button', { name: 'Tanya Harga' })).toBeEnabled()
  await query(page, 'gula putih')
  await expect(page.getByRole('region', { name: 'Hasil harga' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await query(page, 'gula putih')
  await expect(page.getByRole('region', { name: 'Hasil harga' })).toContainText('Rp 18.500')
})

test('PIN lokal opsional, CRUD, dan riwayat bertahan setelah muat ulang', async ({ page }) => {
  const pin = '027630'
  await openApp(page, false)
  await page.getByRole('button', { name: 'PIN lokal', exact: true }).click()
  await page.getByLabel('PIN admin').fill(pin)
  await page.getByRole('button', { name: 'Simpan PIN' }).click()
  await expect(page.getByText('PIN lokal tersimpan.')).toBeVisible()
  await page.getByRole('button', { name: 'Kunci mode admin' }).click()
  await expect(page.getByRole('button', { name: 'Tambah produk' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Buka mode admin' }).click()
  await page.getByLabel('PIN admin').fill('000000')
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
  await page.reload()
  await expect(page.getByRole('button', { name: 'Buka mode admin' })).toBeVisible()
  await expect(page.getByText('Modal Rp 38.000')).toHaveCount(0)
  await page.getByRole('button', { name: 'Buka mode admin' }).click()
  await page.getByLabel('PIN admin').fill(pin)
  await page.getByRole('button', { name: 'Verifikasi PIN' }).click()
  await expect(product).toHaveCount(0)
  await page.getByRole('button', { name: 'Riwayat harga', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Kecap Manis Uji')
})

test('cadangan dapat diekspor, divalidasi, dan dipulihkan tanpa mengubah data sebelum konfirmasi', async ({ page }) => {
  const backup = exampleBackup()
  const categoryId = '31cd8d02-197b-46cb-8bc1-39d31d2abf8d'
  backup.categories.push({ id: categoryId, name: 'Bahan pokok' })
  backup.products[1].category_id = categoryId
  backup.history.push({
    id: '3e24d457-96ea-439d-97ef-f5cb6f0ad38f',
    product_id: backup.products[1].id,
    product_label: 'Minyak Goreng Bimoli 2 liter',
    old_price: 39000, new_price: 41000, changed_at: '2026-11-09T02:00:00.000Z',
  })
  await openApp(page, false, backup)
  await page.getByRole('button', { name: 'Cadangan data' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Ekspor JSON' }).click()
  const exported = JSON.parse(await readFile(await (await download).path(), 'utf8'))
  expect(exported).toEqual(backup)

  await chooseBackup(page, { ...exported, products: [...exported.products, exported.products[0]] })
  await expect(page.getByRole('alert')).toContainText('ID produk ganda')
  await expect(page.getByRole('button', { name: 'Ganti data dengan cadangan' })).toHaveCount(0)
  await chooseBackup(page, { ...exported, categories: [] })
  await expect(page.getByRole('alert')).toContainText('merujuk kategori yang tidak tersedia')
  await page.getByRole('button', { name: 'Tutup' }).click()
  await expect(page.getByText('Modal Rp 38.000')).toBeVisible()

  const empty = { ...exported, categories: [], products: [], history: [] }
  await page.getByRole('button', { name: 'Cadangan data' }).click()
  await chooseBackup(page, empty)
  await page.getByRole('button', { name: 'Batal impor' }).click()
  await page.getByRole('button', { name: 'Tutup' }).click()
  await expect(page.getByText('Modal Rp 38.000')).toBeVisible()

  await page.getByRole('button', { name: 'Cadangan data' }).click()
  await chooseBackup(page, empty)
  await page.getByRole('button', { name: 'Ganti data dengan cadangan' }).click()
  await expect(page.getByRole('heading', { name: 'Belum ada produk' })).toBeVisible()
  await page.getByRole('button', { name: 'Cadangan data' }).click()
  await chooseBackup(page, exported)
  await page.getByRole('button', { name: 'Ganti data dengan cadangan' }).click()
  await expect(page.getByText('Cadangan berhasil diimpor.')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Modal Rp 38.000')).toBeVisible()
  await expect(page.getByLabel('Filter kategori')).toContainText('Bahan pokok')
  await page.getByRole('button', { name: 'Riwayat harga', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Rp 39.000')
})
