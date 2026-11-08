import { expect, test, type Page } from '@playwright/test'

async function enterDemo(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Buka demo lokal' }).click()
  await expect(page.getByRole('heading', { name: 'Tanya harga barang' })).toBeVisible()
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

test('pencarian manual, pilihan ukuran, hasil kosong, sesi persisten dan logout di viewport Android', async ({ page }) => {
  await mockSpeech(page, 'unsupported')
  await enterDemo(page)
  await expect(page.getByRole('button', { name: 'Tanya Harga' })).toBeDisabled()
  await query(page, 'minyak bimoli')
  await expect(page.getByRole('heading', { name: 'Pilih barang yang dimaksud' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Hasil harga' })).toHaveCount(0)
  await page.getByRole('button', { name: /2 liter · per pouch/ }).click()
  await expect(page.getByRole('region', { name: 'Hasil harga' })).toContainText('Rp 41.000')
  await query(page, 'kopi imajiner')
  await expect(page.getByRole('heading', { name: 'Barang tidak ditemukan' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(412)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tanya harga barang' })).toBeVisible()
  await page.getByRole('button', { name: 'Keluar' }).click()
  await expect(page.getByRole('heading', { name: 'Masuk ke toko' })).toBeVisible()
})

test('transkripsi id-ID menghasilkan harga dan satu jawaban suara', async ({ page }) => {
  await mockSpeech(page, 'voice')
  await enterDemo(page)
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
  await enterDemo(page)
  await page.getByRole('button', { name: 'Tanya Harga' }).click()
  await expect(page.getByRole('alert')).toContainText('Izin mikrofon ditolak')
  await query(page, 'gula putih')
  await expect(page.getByRole('region', { name: 'Hasil harga' })).toContainText('Rp 18.500')
})

test('mikrofon dapat dibatalkan dan harga disembunyikan saat offline', async ({ page, context }) => {
  await mockSpeech(page, 'cancel')
  await enterDemo(page)
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

test('tambah, edit dengan konfirmasi dan audit, lalu nonaktifkan produk', async ({ page }) => {
  await enterDemo(page)
  await page.getByRole('link', { name: 'Dashboard' }).click()
  await page.getByRole('button', { name: 'Tambah produk' }).click()
  await page.getByLabel('Nama barang').fill('Kecap Manis')
  await page.getByLabel('Satuan').fill('botol')
  await page.getByLabel('Harga jual (Rp)').fill('14000')
  await page.getByRole('button', { name: 'Simpan produk' }).click()
  await expect(page.getByText('Produk berhasil ditambahkan.')).toBeVisible()
  await page.getByRole('button', { name: 'Edit Kecap Manis' }).click()
  await page.getByLabel('Harga jual (Rp)').fill('16000')
  await page.getByRole('button', { name: 'Simpan produk' }).click()
  await expect(page.getByRole('dialog')).toContainText('Rp 14.000')
  await expect(page.getByRole('dialog')).toContainText('Rp 16.000')
  await page.getByRole('button', { name: 'Ya, ubah harga' }).click()
  await page.getByRole('button', { name: 'Riwayat Kecap Manis' }).click()
  await expect(page.getByRole('dialog')).toContainText('Rp 16.000')
  await expect(page.getByRole('dialog')).toContainText('WIB · Anda')
  await page.getByRole('button', { name: 'Tutup' }).click()
  await page.getByRole('link', { name: 'Cari Harga' }).click()
  await query(page, 'kecap manis')
  await expect(page.getByRole('region', { name: 'Hasil harga' })).toContainText('Rp 16.000')
  await page.getByRole('link', { name: 'Dashboard' }).click()
  await page.getByRole('button', { name: 'Edit Kecap Manis' }).click()
  await page.getByLabel('Produk aktif dan dapat dicari').uncheck()
  await page.getByRole('button', { name: 'Simpan produk' }).click()
  await page.getByLabel('Status produk').selectOption('inactive')
  await expect(page.getByRole('listitem').filter({ hasText: 'Kecap Manis' })).toContainText('Nonaktif')
  await page.getByRole('link', { name: 'Cari Harga' }).click()
  await query(page, 'kecap manis')
  await expect(page.getByRole('heading', { name: 'Barang tidak ditemukan' })).toBeVisible()
})
