# Asisten Harga Toko Sembako

Aplikasi React, TypeScript, dan Vite untuk mengelola katalog satu toko. Dashboard langsung terbuka. Produk, kategori, stok, harga jual, harga modal, dan riwayat disimpan di IndexedDB pada browser yang digunakan. Penyimpanan dipisahkan menurut alamat situs, browser, dan profil. Katalog awal kosong.

## Menjalankan aplikasi

Gunakan Node.js 24 atau lebih baru. Di Windows, jalankan perintah ini dari direktori proyek.

```powershell
npm.cmd ci
npm.cmd run dev
```

Buka [http://127.0.0.1:5173](http://127.0.0.1:5173). Di macOS dan Linux, gunakan `npm` sebagai pengganti `npm.cmd`. Aplikasi dapat langsung dipakai tanpa akun dan tanpa konfigurasi database. **PIN lokal** bersifat opsional dan hanya mengunci tampilan admin di browser. PIN bukan enkripsi atau pengamanan terhadap orang yang dapat mengakses profil browser. Mode admin dengan PIN terkunci kembali saat halaman dimuat ulang, dikunci manual, atau setelah 30 menit.

Pilih **Tanya harga dengan suara** untuk memakai mikrofon atau mengetik nama barang. Aplikasi menampilkan hasil dan langsung membacakan nama barang, ukuran, serta harga dalam bahasa Indonesia. Tombol **Bacakan harga** mengulang jawaban. Jika perangkat tidak menyediakan suara Indonesia, mesin cadangan Spellophone/eSpeak NG membuat audio di browser dari berkas aplikasi. Sebagian browser memerlukan internet untuk pengenalan suara. Setelah PWA memuat berkas aplikasi, katalog, perubahan data, pencarian teks, dan suara cadangan dapat digunakan offline. Lisensi GPL-3.0-or-later serta sumber komponen suara cadangan dicantumkan di `speech-license.txt` dalam hasil build.

Aktifkan **Jual curah berdasarkan berat** di formulir produk dan masukkan harga per kg. Sebutkan atau ketik berat dalam gram, ons (100 gram), atau kg, misalnya “gula pasir setengah kilo”. Aplikasi mengalikan harga per kg dengan berat yang diminta. Atur pembulatan ke atas untuk berat pecahan kg, atau isi 0 untuk harga proporsional. Dengan harga Rp18.500/kg dan kelipatan Rp1.000, 500 gram menjadi Rp10.000 dan 2 kg menjadi Rp37.000. Produk kemasan tetap memakai harga yang dimasukkan untuk setiap ukuran.

## Cadangan dan pemindahan data

1. Buka **Cadangan data → Ekspor JSON** untuk mengunduh katalog, harga, kategori, dan riwayat. File berisi harga modal. Simpan di tempat yang sesuai.
2. Untuk memulihkan atau memindahkan data, buka **Cadangan data** pada browser tujuan dan pilih file JSON. Aplikasi memeriksa format, versi, angka, tanggal, duplikasi, dan hubungan antar data.
3. Periksa ringkasan lalu pilih **Ganti data dengan cadangan**. Impor mengganti data katalog lokal dalam satu transaksi. PIN lokal terpisah dari cadangan.

Ekspor sebelum berganti browser, profil, atau domain. Menghapus data situs dari pengaturan browser juga menghapus IndexedDB. Panduan ekspor baca saja untuk database terdahulu tersedia di [MIGRATION.md](MIGRATION.md).

## Build dan deployment Vercel

```powershell
npm.cmd run build
npm.cmd run preview
```

Build menghasilkan situs statis di `dist`. Impor repo GitHub ke Vercel dengan preset **Vite** dan root direktori proyek. `vercel.json` menetapkan perintah build, folder output, dan header mikrofon serta service worker. Buka alamat HTTPS deployment dan impor cadangan bila diperlukan. Untuk verifikasi mikrofon pada HP, gunakan Chrome Android dan izinkan akses mikrofon.

## Pengujian

```powershell
npm.cmd test
npm.cmd run test:ui
```

Tes browser memakai IndexedDB asli pada Chromium dengan viewport Pixel 7, serta simulasi pengenalan dan pembacaan suara. Windows memakai Edge yang terpasang. Pada sistem lain, siapkan Chromium dengan `npx playwright install chromium`. Tes mencakup CRUD, riwayat setelah muat ulang, pencarian offline, serta ekspor, validasi, dan pemulihan cadangan.

Dokumentasi platform tersedia di [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB) dan [Vite di Vercel](https://vercel.com/docs/frameworks/frontend/vite).
