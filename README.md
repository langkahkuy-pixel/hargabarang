# Asisten Harga Toko Sembako

Aplikasi React, TypeScript, dan Supabase PostgreSQL untuk mencari harga jual melalui mikrofon atau teks. Owner dapat mengelola katalog, harga modal, dan riwayat perubahan harga. Staff dapat mencari barang aktif dan membaca harga jual.

## Mulai secara lokal

Prasyaratnya Node.js 22.12 atau lebih baru dan npm. Supabase lokal memerlukan Docker yang sedang berjalan. Perintah di bawah menggunakan PowerShell Windows. Di macOS atau Linux, gunakan `npm` sebagai pengganti `npm.cmd`.

```powershell
npm.cmd ci
npm.cmd run dev
```

Buka [http://127.0.0.1:5173](http://127.0.0.1:5173). Jika dua variabel Supabase kosong, tombol **Buka demo lokal** membuka katalog contoh. Demo menyimpan perubahan di browser dan hanya tersedia pada server pengembangan. Coba **Minyak Bimoli 2 liter** untuk satu hasil atau **Minyak Bimoli** untuk memilih ukuran.

### Hubungkan Supabase lokal

1. Jalankan `npm.cmd run supabase -- start` dan `npm.cmd run supabase -- status`. Jalankan stack pengembangan pada mesin dan jaringan tepercaya. API, database, dan Studio lokal memakai port 54321, 54322, dan 54323.
2. Pada database lokal baru, CLI menjalankan [migrasi](supabase/migrations/20261108000100_initial_catalog.sql) dan [seed](supabase/seed.sql). Jika perlu mengulang dari awal, `npm.cmd run supabase -- db reset` menghapus data dan akun lokal lalu menjalankan kembali migrasi dan seed.
3. Salin `.env.example` ke `.env.local`. Isi variabel berikut dan mulai ulang Vite.

   ```dotenv
   VITE_SUPABASE_URL=http://127.0.0.1:54321
   VITE_SUPABASE_ANON_KEY=<publishable-atau-anon-dari-status-lokal>
   ```

4. Buka Studio lokal di [http://127.0.0.1:54323](http://127.0.0.1:54323). Di **Authentication → Users**, buat akun email dengan kata sandi dan konfirmasi email sebagai administrator. Salin UUID akun.
5. Di SQL Editor, jalankan perintah ini setelah mengganti placeholder UUID pengguna. UUID toko di contoh adalah toko dari seed lokal.

   ```sql
   insert into public.profiles (user_id, store_id, role)
   values ('<uuid-pengguna-auth>', '7d292361-2eb3-447b-93a8-26be9aa88880', 'owner');
   ```

6. Masuk menggunakan akun tadi. Ulangi langkah akun dengan UUID berbeda dan role `staff` untuk menguji akses anggota.

Untuk membuat toko baru tanpa seed, jalankan `insert into public.stores (name) values ('Nama Toko') returning id;` sebagai administrator, lalu gunakan ID hasilnya saat memasukkan profil. Pendaftaran publik dinonaktifkan pada konfigurasi lokal. Akun hanya mendapat akses setelah administrator memasangkan UUID pengguna dengan toko dan role.

## Build dan hosting HTTPS

```powershell
npm.cmd run build
npm.cmd run preview
```

Build menghasilkan `dist/` dengan manifest dan service worker. Instalasi PWA dan pengenalan suara memerlukan konteks aman. Loopback di komputer pengembangan dapat digunakan untuk pengujian lokal. Untuk HP Android, buka URL HTTPS yang sertifikatnya dipercaya perangkat.

1. Siapkan proyek Supabase untuk lingkungan hosting. Terapkan migrasi dengan `npm.cmd run supabase -- link --project-ref <ref-proyek>` lalu `npm.cmd run supabase -- db push`. Jalankan prosedur provisioning toko dan pengguna di Dashboard Supabase. Nonaktifkan pendaftaran publik di konfigurasi Auth proyek.
2. Impor repo di Vercel dengan preset Vite. Isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` dari proyek Supabase yang sesuai sebelum build. [vercel.json](vercel.json) menetapkan header untuk mikrofon dan pembaruan service worker. Navigasi menggunakan hash URL sehingga halaman dapat dimuat ulang di hosting statis.
3. Pasang melalui **Instal aplikasi** atau **Tambahkan ke layar utama** pada menu Chrome Android, sesuai opsi yang diberikan perangkat. Jalankan checklist di bawah pada URL HTTPS sebelum digunakan di toko.

## Pengujian

```powershell
npm.cmd test
npm.cmd run test:db
npm.cmd run test:ui
npm.cmd run build
```

- `test` memeriksa normalisasi, pemilihan hasil, angka, waktu WIB, dan kebijakan keamanan pada PostgreSQL tertanam. Lapisan identitas Supabase disimulasikan pada tes SQL tersebut.
- `test:ui` membuka browser Chromium dalam viewport Pixel 7. Di Windows, konfigurasi menggunakan Edge yang terpasang. Di sistem lain, jalankan `npx playwright install chromium` terlebih dahulu. Mode demo menguji alur katalog, izin mikrofon yang ditolak, fallback teks, offline, serta transkripsi dan pembacaan suara dengan simulasi Web Speech API.
- Untuk tes browser dengan Supabase sungguhan, mulai stack lokal dan sediakan variabel berikut di **terminal pengujian**. Tes membuat akun dan toko sementara, memeriksa Auth dan RLS melalui API, menguji build PWA, lalu membersihkan data uji. Gunakan kunci admin dari stack lokal saja.

  ```powershell
  $env:PW_SUPABASE_URL = 'http://127.0.0.1:54321'
  $env:PW_SUPABASE_PUBLIC_KEY = '<publishable-atau-anon-lokal>'
  $env:PW_SUPABASE_SERVICE_KEY = '<secret-atau-service_role-lokal>'
  npm.cmd run test:ui
  Remove-Item Env:PW_SUPABASE_SERVICE_KEY, Env:PW_SUPABASE_PUBLIC_KEY, Env:PW_SUPABASE_URL
  ```

### Checklist Chrome pada HP Android

- [ ] Masuk, muat ulang halaman, dan periksa sesi masih aktif. Keluar dan pastikan katalog meminta login.
- [ ] Tekan **Tanya Harga**, izinkan mikrofon, lalu ucapkan “harga minyak Bimoli dua liter berapa”. Periksa transkripsi, harga sesuai database, dan jawaban suara Indonesia. Uji tombol hentikan serta bacakan ulang.
- [ ] Tolak izin mikrofon atau batalkan perekaman. Periksa pencarian teks tetap bekerja.
- [ ] Cari nama dengan dua ukuran. Periksa harga muncul setelah memilih produk. Cari nama yang tidak ada dan periksa pesan hasil kosong.
- [ ] Ubah harga sebagai owner, konfirmasi harga lama dan baru, cek riwayat, lalu cari ulang. Periksa bahwa penonaktifan menghapus produk dari pencarian.
- [ ] Masuk sebagai staff. Periksa harga jual dapat dicari dan Dashboard tidak tersedia.
- [ ] Pasang PWA, putuskan koneksi, lalu muat ulang. Periksa indikator offline dan tidak ada harga yang ditampilkan sebagai harga terkini.
- [ ] Periksa tampilan pada orientasi potret, ukuran teks Android yang diperbesar, serta tombol dengan navigasi keyboard atau TalkBack.

## Keamanan dan privasi

- Kunci `VITE_` dikirim ke browser. Gunakan hanya kunci publishable atau anon. Build menolak nilai kunci privat pada `VITE_SUPABASE_ANON_KEY`. Kunci secret dan `service_role` digunakan di sisi admin saja.
- RLS membatasi data berdasarkan profil milik `auth.uid()`. Peran dan keanggotaan hanya dapat diatur administrator. Harga modal ada di `product_costs` dan hanya dapat dibaca owner dari toko yang sama. SKU unik per toko jika diisi.
- Perubahan katalog dan modal disimpan dalam satu transaksi. Perubahan harga memakai harga lama sebagai pemeriksaan saat menyimpan. Trigger mencatat harga lama, harga baru, waktu server, dan UUID pengguna. Akses aplikasi hanya dapat membaca audit sesuai RLS.
- Aplikasi mengaktifkan mikrofon hanya setelah pengguna menekan tombol. Aplikasi tidak merekam, menyimpan, atau mengirim audio mentah ke Supabase. Browser dapat memproses suara lewat layanan vendornya dan membutuhkan internet. Jika suara Indonesia tidak tersedia, hasil tetap ditampilkan sebagai teks.
- Service worker menyimpan berkas antarmuka. Katalog, harga, dan tanggapan API Auth tidak disimpan dalam cache PWA. Mode produksi selalu meminta harga ke Supabase.

Lihat dokumentasi resmi untuk [Supabase lokal](https://supabase.com/docs/guides/local-development), [kunci API Supabase](https://supabase.com/docs/guides/getting-started/api-keys), [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API), dan [konfigurasi Vercel](https://vercel.com/docs/project-configuration/vercel-json).
