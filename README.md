# Asisten Harga Toko Sembako

Aplikasi satu toko dengan React, TypeScript, Vite, Vercel Functions, dan MariaDB. URL langsung membuka dashboard katalog. Pilih **Tanya harga dengan suara** untuk mencari melalui mikrofon atau teks. PIN diperlukan hanya untuk mengelola produk dan kategori serta membaca harga modal dan riwayat.

## MariaDB

Gunakan MariaDB 10.11 atau lebih baru dan Node.js 22.12 atau lebih baru. Buat database baru, lalu buka klien MariaDB sebagai administrator dari direktori proyek.

```sql
CREATE DATABASE asisten_harga CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE asisten_harga;
SOURCE db/schema.sql;
-- Opsional untuk lingkungan pengembangan
SOURCE db/seed.sql;
```

Skema harus diterapkan sekali pada database kosong. Akun migrasi perlu izin membuat tabel dan trigger. Berikan akun aplikasi akses pada database ini saja. Contoh izin di bawah mengasumsikan akun `asisten_app` telah dibuat pada host yang sesuai dengan aturan penyedia database.

```sql
GRANT SELECT, INSERT, UPDATE ON asisten_harga.products TO 'asisten_app'@'<host>';
GRANT SELECT, INSERT, UPDATE, DELETE ON asisten_harga.categories TO 'asisten_app'@'<host>';
GRANT SELECT ON asisten_harga.price_history TO 'asisten_app'@'<host>';
GRANT SELECT, UPDATE ON asisten_harga.admin_pin_attempts TO 'asisten_app'@'<host>';
```

Trigger berjalan dengan hak akun yang membuatnya. Pertahankan akun tersebut dan hak tulisnya ke `price_history`. Saat harga jual berubah, MariaDB menyimpan harga lama, harga baru, waktu UTC, dan nama produk saat perubahan dalam transaksi yang sama. Penghapusan produk mengeluarkannya dari katalog tanpa menghapus audit. Penghapusan kategori memindahkan produknya ke **Tanpa kategori**.

Jika perlu membawa katalog lama, ikuti [rencana migrasi](MIGRATION.md).

## Pengembangan lokal

```powershell
npm.cmd ci
npm.cmd run admin:pin
```

Perintah kedua menghasilkan PIN 10 angka, hash PIN, dan kunci penanda tangan sesi. Simpan PIN secara pribadi. Salin `.env.example` ke `.env.local` dan isi variabel berikut. Di macOS atau Linux gunakan `npm`.

| Variabel | Nilai |
| --- | --- |
| `MARIADB_HOST`, `MARIADB_PORT` | Host dan port MariaDB. Port standar `3306`. |
| `MARIADB_DATABASE`, `MARIADB_USER`, `MARIADB_PASSWORD` | Nama database dan kredensial akun aplikasi. |
| `MARIADB_TLS` | `true` untuk koneksi TLS dengan verifikasi sertifikat. `false` hanya didukung untuk MariaDB loopback saat pengembangan. |
| `MARIADB_CA_PEM` | Opsional untuk CA privat. Isi sertifikat CA dalam format PEM. |
| `ADMIN_PIN_HASH`, `ADMIN_SESSION_SECRET` | Dua nilai yang dicetak oleh `npm.cmd run admin:pin`. |

Gunakan nama variabel di tabel tanpa awalan `VITE_`. Jangan memasukkan kredensial atau PIN ke Git. Untuk mengganti PIN, buat sepasang hash dan kunci baru lalu perbarui environment deployment. Sesi lama akan ditolak.

```powershell
npm.cmd run dev
```

Buka [http://127.0.0.1:5173](http://127.0.0.1:5173). Vite meneruskan `/api/store` ke handler yang sama dengan Vercel. Dengan data contoh, pencarian **Minyak Bimoli 2 liter** menampilkan **Rp 41.000**. Untuk uji build produksi dan PWA secara lokal, jalankan `npm.cmd run build` lalu `npm.cmd run preview`.

## Deployment dari GitHub

1. Siapkan database eksternal, jalankan skema, lalu pastikan server MariaDB dapat dijangkau dari Vercel dan menyediakan TLS. Gunakan kredensial dan database terpisah untuk Production dan Preview.
2. Impor repo GitHub ke Vercel. Gunakan preset **Vite**, direktori akar repo, dan Node.js 22.x atau lebih baru. `vercel.json` menetapkan konfigurasi build dan header. File `api/store.ts` menjadi Vercel Function Node.js.
3. Di pengaturan Environment Variables proyek Vercel, isi variabel dari tabel untuk environment yang sesuai. Simpan kata sandi MariaDB, hash PIN, dan kunci sesi sebagai variabel sensitif. Lakukan deploy atau redeploy setelah mengubahnya.
4. Atur Production Branch sesuai cabang utama repo. Push ke cabang yang terhubung memicu deployment. Buka URL HTTPS hasil deploy, cek katalog, lalu uji PIN, perubahan harga, dan jawaban suara.

## Keamanan dan suara

- Dashboard publik menampilkan kategori dan produk aktif beserta harga jual. Siapa pun yang dapat menjangkau URL dapat membaca data publik tersebut.
- Backend memverifikasi hash scrypt dari PIN. Cookie akses admin berlaku 30 menit, ditandatangani server, memakai `HttpOnly`, `SameSite=Strict`, dan `Secure` melalui HTTPS. PIN tidak disimpan oleh aplikasi di browser. Tombol **Kunci mode admin** menghapus cookie dari browser itu.
- Endpoint perubahan memerlukan cookie admin yang sah dan pemeriksaan asal permintaan. Pembatas PIN bersama di MariaDB mengizinkan 10 percobaan per 5 menit. Saat batas tercapai, tunggu jendela percobaan berikutnya.
- API memvalidasi ID, teks, status, harga, stok, dan ukuran permintaan. Query menggunakan parameter, dan pembaruan produk memeriksa versi terakhir agar perubahan dari dua perangkat tidak saling menimpa.
- PWA menyimpan berkas antarmuka saja. Harga dan balasan API selalu diminta melalui jaringan. Mikrofon aktif setelah tombol ditekan. Browser dapat memproses suara melalui layanannya sendiri. Jika pengenalan suara atau suara Indonesia tidak tersedia, hasil dapat dicari dan dibaca sebagai teks.

## Pengujian

```powershell
npm.cmd test
npm.cmd run test:ui
npm.cmd run build
```

Tes otomatis memeriksa PIN, cookie, penolakan permintaan lintas asal, validasi data, dan pencocokan produk. Playwright menggunakan viewport Pixel 7 dan mensimulasikan pengenalan suara serta pembacaan harga. Windows menggunakan Edge yang terpasang. Pada sistem lain siapkan Chromium dengan `npx playwright install chromium`.

Untuk tes SQL sungguhan, buat database kosong bernama `asisten_harga_test` dan set `MARIADB_TEST_DATABASE` ke nama itu. Isi variabel koneksi di **terminal pengujian** dengan akun yang berhak membuat tabel dan trigger di database uji. Jalankan `npm.cmd run test:db`. Tes menerapkan skema dan seed, lalu menghapus tabel yang dibuatnya saat selesai.

Untuk tes browser dengan database nyata, siapkan database MariaDB **lokal** khusus bernama `asisten_harga_test_ui` dengan skema dan seed. Set variabel koneksi di terminal, `PW_REAL_DB=1`, serta `PW_ADMIN_PIN` dan konfigurasi hash serta sesi dengan PIN khusus pengujian. Jalankan `npm.cmd run test:ui`. Tes membuat kategori dan produk contoh, mengubah harga, memeriksa audit, lalu menghapus kategori dan produk tersebut melalui UI.

Pada Chrome Android fisik, buka URL HTTPS, izinkan mikrofon, lalu ucapkan “harga minyak Bimoli dua liter berapa” bila data tersebut tersedia. Periksa harga dan jawaban suara, tolak izin untuk menguji pencarian teks, lalu putuskan koneksi untuk memeriksa tampilan offline. Uji pemasangan PWA dari menu Chrome.

Dokumentasi resmi tersedia di [Vercel Functions](https://vercel.com/docs/functions/runtimes/node-js), [integrasi GitHub](https://vercel.com/docs/git/vercel-for-github), [environment variables Vercel](https://vercel.com/docs/environment-variables), dan [koneksi MariaDB](https://mariadb.com/docs/connectors/mariadb-connector-nodejs/node-js-connection-options).
