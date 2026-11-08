# PRD — Asisten Harga Toko Sembako (MVP v2)

## Tujuan
Aplikasi web mobile-first untuk pemilik toko kelontong mencari harga jual barang lewat tombol mikrofon, mendengar jawaban suara, dan mengelola katalog/harga dari dashboard. Penggunaan utama pada HP Android. Tidak ada fitur always-listening.

## Stack
- React + Vite + TypeScript, PWA installable, responsive Android.
- Supabase PostgreSQL + Supabase Auth; Row Level Security (RLS) wajib.
- Supabase JS client untuk operasi data yang diizinkan RLS; jangan pernah menaruh service_role key di frontend.
- Web Speech API SpeechRecognition (dengan prefiks browser bila perlu) dan speechSynthesis. Deteksi dukungan browser; fallback pencarian teks jika tidak didukung.
- Deploy ke hosting HTTPS yang mendukung SPA/PWA (mis. Vercel, sesuai ketentuan paket).

## Pengguna
Pemilik toko dan anggota keluarga yang diizinkan. MVP satu toko; desain skema siap multi-toko tanpa perlu implementasi billing.

## Alur utama
1. Pengguna login.
2. Halaman utama menampilkan tombol besar 'Tanya Harga', kolom pencarian manual, dan tautan Dashboard.
3. Saat tombol ditekan, minta izin mikrofon; tampilkan status mendengarkan, hasil transkripsi, loading, dan error.
4. Parse kalimat seperti 'harga minyak bimoli dua liter berapa', cari produk berdasarkan nama, merek, ukuran, satuan, dan alias. Gunakan pencocokan deterministik/normalisasi; jika ambigu tampilkan pilihan, jangan menebak.
5. Ambil harga jual dari PostgreSQL; tampilkan angka besar dan bacakan dengan speechSynthesis berbahasa Indonesia. Jika tidak ditemukan, katakan tidak ditemukan, bukan mengarang harga.
6. Admin dapat menambah/edit/nonaktifkan produk, mengubah harga, dan melihat riwayat perubahan.

## Fitur MVP
- Login/logout, sesi persisten.
- Dashboard: total produk aktif, produk yang harganya berubah hari ini, daftar produk dan pencarian.
- CRUD produk: nama, merek, varian/ukuran, satuan, SKU opsional, alias pencarian, harga modal opsional, harga jual wajib, stok opsional, status aktif.
- Perubahan harga dengan konfirmasi; catat harga lama, harga baru, waktu, dan user.
- Voice search dengan tombol (push-to-talk), teks transkripsi, hasil harga, dan TTS; manual fallback.
- Tampilan tombol besar dan kontras baik untuk pengguna lebih tua.
- Harga modal hanya terlihat untuk role owner; harga jual untuk pengguna toko yang login.
- Empty/loading/error states; pesan jika offline; jangan mengklaim harga terkini bila data gagal dimuat.

## Skema database minimum
- stores(id uuid PK, name text, created_at timestamptz)
- profiles(user_id uuid PK references auth.users, store_id uuid references stores, role text check in ('owner','staff'))
- products(id uuid PK, store_id uuid FK, name text, brand text, variant text, unit text, sku text, aliases text[], cost_price numeric(12,2), sale_price numeric(12,2) not null check(sale_price>=0), stock_qty numeric(12,2), is_active boolean, updated_at timestamptz, created_at timestamptz)
- price_history(id uuid PK, store_id uuid FK, product_id uuid FK, old_price numeric(12,2), new_price numeric(12,2), changed_by uuid, changed_at timestamptz)
- Index products(store_id, is_active), product SKU unique per store if supplied; implement sensible search indexing after MVP.
- Database trigger records price_history when sale_price changes; prevent client-side spoofing of audit fields.
- RLS on all tables: users only access rows of their own store; owner controls editing and cost prices; avoid exposing cost_price via staff queries (use a restricted view/RPC or separate protected table as appropriate). Secure profile role assignment server-side.

## Voice implementation considerations
- SpeechRecognition support varies by browser/device and may use browser vendor services; not guaranteed offline. Requires HTTPS and microphone permission. Avoid recording/uploading raw audio in app backend; document browser processing/privacy.
- speechSynthesis choose available Indonesian voice if present, otherwise text-only fallback.
- Prevent accidental repeated recognition and double playback; allow stop/cancel.
- Product names with similar pronunciation must prompt user to choose.

## Non-goals MVP
- Wake-word, background listening, always-on microphone, POS transactions, automatic market price updates, payment/billing, AI paid API, offline database sync.

## Acceptance criteria
1. On supported Android Chrome over HTTPS, pressing mic, saying a known product, and finishing recognition yields the matching price in text and audible answer.
2. Manual search works even if voice recognition is unsupported or denied.
3. Ambiguous and missing products are handled without guessing.
4. Owner updates price in dashboard; subsequent search returns the new price and audit history contains the change.
5. Unauthenticated users cannot access private store data; cross-store access is denied by RLS.
6. Owner-only cost price cannot be read by staff.
7. Basic mobile usability and error states tested.

## Implementation sequence for coding agent
1. Scaffold React/Vite/TypeScript PWA; create mobile-first screens with seeded local mock data.
2. Add Supabase SQL migrations, RLS policies, trigger, and test data seeding instructions.
3. Implement Auth, product CRUD, dashboard, price history, and store isolation.
4. Implement manual search and deterministic product matching.
5. Add speech recognition and speech synthesis with graceful fallback.
6. Test on Android device and deploy to HTTPS; provide README with Supabase setup, env vars, migration commands, testing checklist, and security notes.

## Configuration
Use VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (publishable/anon key only); never commit secrets. Owner account/store bootstrap must use a safe admin setup, not public role selection.
