# Memindahkan data lama ke IndexedDB

IndexedDB mulai dengan katalog kosong pada setiap browser dan alamat situs. Pindahkan data melalui file JSON. Langkah ekspor di bawah hanya membaca data sumber.

## Supabase lama

Di SQL Editor Supabase, jalankan kueri berikut dengan UUID toko yang hendak dipindahkan. Kueri mengikuti skema historis proyek yang memisahkan harga modal ke tabel `product_costs`. Jika skema sumber sudah berubah, sesuaikan nama tabel dan kolomnya sebelum menjalankan.

```sql
WITH chosen_products AS (
  SELECT * FROM public.products
  WHERE store_id = 'GANTI-DENGAN-UUID-TOKO'::uuid
)
SELECT jsonb_build_object(
  'format', 'asisten-harga',
  'version', 1,
  'categories', '[]'::jsonb,
  'products', COALESCE((
    SELECT jsonb_agg((to_jsonb(p) - 'store_id') || jsonb_build_object(
      'category_id', NULL, 'cost_price', c.cost_price, 'revision', 1, 'deleted_at', NULL,
      'created_at', to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'updated_at', to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ))
    FROM chosen_products p
    LEFT JOIN public.product_costs c ON c.product_id = p.id AND c.store_id = p.store_id
  ), '[]'::jsonb),
  'history', COALESCE((
    SELECT jsonb_agg((to_jsonb(h) - 'store_id' - 'changed_by') || jsonb_build_object(
      'product_label', concat_ws(' ', p.name, nullif(p.brand, ''), nullif(p.variant, '')),
      'changed_at', to_char(h.changed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ))
    FROM public.price_history h
    JOIN chosen_products p ON p.id = h.product_id AND p.store_id = h.store_id
  ), '[]'::jsonb)
) AS backup;
```

Salin nilai objek dari kolom `backup` ke file `cadangan-supabase.json`. Skema lama belum memiliki kategori, sehingga produk hasil migrasi masuk ke **Tanpa kategori**. Nama produk pada riwayat diambil dari katalog lama karena versi Supabase mencatat ID produk. Identitas akun tidak diperlukan di penyimpanan lokal.

## MariaDB lama

Jika versi MariaDB pernah dipakai, ekspor seluruh baris `categories`, `products`, dan `price_history` dengan klien database secara baca saja. Susun hasilnya menjadi `{"format":"asisten-harga","version":1,"categories":[...],"products":[...],"history":[...]}`. Gunakan ketentuan berikut untuk menyiapkan JSON.

- Kategori memakai `id` dan `name`. Produk memakai `id`, `category_id`, `name`, `brand`, `variant`, `unit`, `sku`, `aliases`, `sale_price`, `cost_price`, `stock_qty`, `is_active`, `revision`, `created_at`, `updated_at`, dan `deleted_at`.
- Riwayat memakai `id`, `product_id`, `product_label`, `old_price`, `new_price`, dan `changed_at`. Sertakan produk yang sudah dihapus jika masih dirujuk riwayat. Pertahankan `deleted_at` agar produk itu tetap tersembunyi dari katalog.
- Gunakan angka JSON untuk harga, stok, dan revisi, boolean JSON untuk `is_active`, array teks untuk `aliases`, dan `null` untuk kolom opsional yang kosong. Format waktu UTC sebagai `2026-11-09T02:00:00.000Z`. Kolom `DATETIME` pada skema sebelumnya sudah menggunakan UTC.
- Kolom `live_sku` dan tabel percobaan PIN boleh diabaikan. Ambil contoh struktur yang dapat diimpor dengan memilih **Cadangan data → Ekspor JSON** pada aplikasi baru.

## Impor dan verifikasi

1. Buka aplikasi di alamat yang akan dipakai sehari-hari. Jika sudah ada katalog lokal, simpan cadangan lewat **Cadangan data → Ekspor JSON** terlebih dahulu.
2. Pilih file JSON melalui **Cadangan data**. Jika ada penolakan, perbaiki nilai yang disebutkan pada salinan JSON dan simpan ekspor asli. Cocokkan jumlah produk, kategori, dan perubahan harga pada ringkasan. Pilih **Ganti data dengan cadangan** setelah jumlahnya sesuai.
3. Periksa beberapa SKU, harga jual, harga modal, dan entri riwayat. Muat ulang halaman dan ulangi pencarian untuk memastikan data tersimpan. Simpan file ekspor asli bersama cadangan lokal yang telah diperiksa.
