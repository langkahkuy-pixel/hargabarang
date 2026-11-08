# Rencana migrasi ke MariaDB

Audit awal menemukan bahwa Supabase digunakan untuk sesi, profil, katalog, dan riwayat. React, Vite, PWA, komponen dashboard, pencocokan produk, serta pengenalan dan sintesis suara sudah terpisah dari penyimpanan data. Kode awal ada di commit `17fb2f1` untuk acuan pemulihan.

1. Buat skema satu toko di MariaDB dan API Vercel Functions. Sediakan katalog baca publik yang hanya memuat barang aktif serta harga jual. Verifikasi PIN di server untuk akses perubahan, harga modal, dan riwayat, dengan batas percobaan yang disimpan di MariaDB.
2. Sambungkan dashboard langsung ke API baru. Pertahankan pencarian suara, fallback teks, konfirmasi perubahan harga, dan PWA. Tambahkan kategori dan penghapusan produk yang tetap menyimpan audit.
3. Uji operasi database, otorisasi PIN, serta alur browser. Hapus adapter, dependensi, konfigurasi, dan tes Supabase setelah penggantinya siap. Simpan PRD lama sebagai referensi historis. Keputusan satu toko tanpa akun mengikuti dokumen ini dan README terbaru.
4. Bila database lama berisi data yang akan dipakai, buat ekspor cadangan sebelum beralih. Gunakan [panduan pemindahan](#pemindahan-data-lama) dan verifikasi hasil di database tujuan. Mulai dari skema kosong jika toko belum mempunyai data nyata.
5. Hubungkan repo GitHub ke Vercel setelah environment produksi siap. Periksa daftar produk dan riwayat sebelum mengalihkan penggunaan toko ke URL baru. Database lama dapat dipertahankan sebagai cadangan sampai hasil pemindahan dikonfirmasi.

## Pemindahan data lama

Gunakan akses administrator ke sumber lama dan ekspor produk untuk satu toko saja. Simpan ekspor di luar Git. Salin UUID dan atribut produk, gabungkan harga dari `product_costs` ke kolom `products.cost_price`, dan simpan alias sebagai array JSON. Isi `category_id` dengan NULL jika kategori belum dipetakan. Impor produk terlebih dahulu, kemudian salin riwayat dengan UUID produk yang sama, harga lama, harga baru, dan waktu dalam UTC. Riwayat baru menyimpan nama produk saat perubahan, jadi isi `product_label` saat impor. Identitas pengguna, tabel toko, dan profil tidak dibutuhkan di sistem baru.

Untuk data demo yang pernah diedit di browser, salin objek dari Local Storage dengan kunci `asisten-harga:demo-catalog:v1` melalui DevTools. Data demo berisi produk, harga modal, dan riwayat. Buat pemetaan UUID baru untuk ID contoh seperti `demo-2` lalu gunakan pemetaan yang sama untuk harga modal dan riwayat. File seed MariaDB berisi data contoh awal untuk pengembangan.

Bandingkan jumlah produk, SKU, harga, dan riwayat setelah impor. Uji satu produk melalui dashboard dan pencarian suara, lalu uji perubahan harga pada database uji sebelum mengaktifkan produksi. Simpan cadangan sampai hasil diperiksa. Migrasi skema tidak membaca atau mengubah database lama.
