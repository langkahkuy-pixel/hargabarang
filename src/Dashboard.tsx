import { useEffect, useState, type FormEvent } from 'react'
import { Clock3, History, Lock, Mic, Package, Pencil, Plus, RefreshCw, Search, Tag, Trash2, TrendingUp, Unlock } from 'lucide-react'
import {
  CatalogError, catalogErrorMessage, localDateTime, parseAmount, productDescription, productName, rupiah,
  type Catalog, type Category, type DashboardData, type PriceChange, type Product, type ProductDraft,
} from './catalog'
import { searchTokens } from './search'
import { Loading, Modal, Notice } from './ui'

type View = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'loaded'; snapshot: DashboardData }
type Dialog = { kind: 'edit' | 'history'; product: Product | null } | { kind: 'delete'; product: Product } | { kind: 'unlock' | 'categories' }

function filterProducts(products: Product[], query: string, status: string, category: string) {
  const tokens = searchTokens(query)
  const normalized = query.trim().toLocaleLowerCase('id')
  return products.filter((product) => {
    if (status === 'active' && !product.is_active) return false
    if (status === 'inactive' && product.is_active) return false
    if (category !== 'all' && (product.category_id ?? 'none') !== category) return false
    const source = [productName(product), product.variant, product.unit, product.sku ?? '', ...product.aliases].join(' ')
    const indexed = searchTokens(source)
    return !normalized || source.toLocaleLowerCase('id').includes(normalized)
      || (tokens.length > 0 && tokens.every((token) => indexed.some((part) => part.startsWith(token))))
  })
}

export default function Dashboard({ catalog, online }: { catalog: Catalog; online: boolean }) {
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [revision, setRevision] = useState(0)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [category, setCategory] = useState('all')
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [success, setSuccess] = useState('')
  const [lockBusy, setLockBusy] = useState(false)
  const [lockError, setLockError] = useState('')

  useEffect(() => {
    if (!online) return
    const request = new AbortController()
    setView({ kind: 'loading' })
    void catalog.dashboard(request.signal).then((snapshot) => {
      if (request.signal.aborted) return
      snapshot.products.sort((left, right) => productName(left).localeCompare(productName(right), 'id')
        || left.variant.localeCompare(right.variant, 'id', { numeric: true }))
      setView({ kind: 'loaded', snapshot })
    }).catch((error) => {
      if (!request.signal.aborted) setView({ kind: 'error', message: catalogErrorMessage(error, 'Katalog gagal dimuat.') })
    })
    return () => request.abort()
  }, [catalog, online, revision])

  const snapshot = view.kind === 'loaded' ? view.snapshot : null
  const adminUntil = snapshot?.adminUntil
  const admin = online && Boolean(adminUntil && adminUntil > Date.now())
  const products = snapshot?.products ?? []
  const categories = snapshot?.categories ?? []
  const categoryNames = new Map(categories.map((item) => [item.id, item.name]))
  const selectedCategory = category === 'none' || categoryNames.has(category) ? category : 'all'
  const filtered = filterProducts(products, query, admin ? status : 'all', selectedCategory)
  const refresh = () => setRevision((value) => value + 1)
  const close = () => setDialog(null)
  const saved = (message: string) => {
    close()
    setSuccess(message)
    refresh()
  }

  useEffect(() => {
    if (!adminUntil || adminUntil <= Date.now()) return
    const timer = window.setTimeout(() => {
      setDialog(null)
      setView({ kind: 'loading' })
      setRevision((value) => value + 1)
    }, adminUntil - Date.now() + 100)
    return () => window.clearTimeout(timer)
  }, [adminUntil])

  async function lock() {
    setLockBusy(true)
    setLockError('')
    try {
      await catalog.lock()
      setView({ kind: 'loading' })
      saved('Mode admin dikunci.')
    } catch (error) {
      setLockError(catalogErrorMessage(error, 'Mode admin gagal dikunci.'))
    } finally {
      setLockBusy(false)
    }
  }

  return <div className="dashboard">
    <div className="page-heading dashboard-heading">
      <div>
        <div className="eyebrow"><span className="status-dot" /> MANAJEMEN TOKO</div>
        <h1>Dashboard produk</h1>
        <p>Kelola katalog, harga jual, dan riwayat perubahan toko.</p>
      </div>
      <a href="#cari" className="button primary"><Mic size={20} /> Tanya harga dengan suara</a>
    </div>

    <div className="metrics">
      <div className="metric"><span className="metric-icon"><Package size={24} /></span>
        <div><strong>{online && snapshot ? products.filter((product) => product.is_active).length : '—'}</strong><span>Produk aktif</span></div>
      </div>
      <div className="metric"><span className="metric-icon amber"><TrendingUp size={24} /></span>
        <div><strong>{online && snapshot ? snapshot.changedToday : '—'}</strong><span>Produk berubah harga hari ini</span></div>
      </div>
    </div>

    {success && <div className="success" role="status">{success}</div>}
    {lockError && <Notice error>{lockError}</Notice>}
    <section className="catalog-card" aria-labelledby="catalog-title">
      <div className="catalog-head">
        <div><h2 id="catalog-title">Katalog produk</h2><p className="muted">Barang dan harga yang tersimpan di toko.</p></div>
        <div className="catalog-actions">
          {admin
            ? <button type="button" className="button secondary" disabled={lockBusy} onClick={() => void lock()}><Lock size={18} /> Kunci mode admin</button>
            : <button type="button" className="button secondary" disabled={!online}
              onClick={() => { setLockError(''); setDialog({ kind: 'unlock' }) }}><Unlock size={18} /> Buka mode admin</button>}
          <button type="button" className="icon-button" disabled={!online} onClick={refresh} aria-label="Muat ulang katalog"><RefreshCw size={19} /></button>
        </div>
      </div>
      {admin && <div className="catalog-actions manage-actions">
        <button type="button" className="button primary" onClick={() => setDialog({ kind: 'edit', product: null })}><Plus size={18} /> Tambah produk</button>
        <button type="button" className="button secondary" onClick={() => setDialog({ kind: 'categories' })}><Tag size={18} /> Kelola kategori</button>
        <button type="button" className="button secondary" onClick={() => setDialog({ kind: 'history', product: null })}><History size={18} /> Riwayat harga</button>
      </div>}
      <div className="filters">
        <div className="input-icon"><Search size={19} aria-hidden="true" />
          <input aria-label="Cari produk di katalog" type="search" placeholder="Cari produk, merek, atau SKU"
            value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <select aria-label="Filter kategori" value={selectedCategory} onChange={(event) => setCategory(event.target.value)}>
          <option value="all">Semua kategori</option><option value="none">Tanpa kategori</option>
          {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        {admin && <select aria-label="Status produk" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">Semua status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option>
        </select>}
      </div>
      {!online && <div className="empty"><p>Katalog tersedia saat perangkat terhubung.</p></div>}
      {online && view.kind === 'loading' && <Loading>Memuat katalog…</Loading>}
      {online && view.kind === 'error' && <Notice error>{view.message} <button type="button" className="text-button" onClick={refresh}>Coba lagi</button></Notice>}
      {online && snapshot && (filtered.length ? <ul className="product-list">
        {filtered.map((product) => <li key={product.id} className="product-row">
          <span className="product-icon"><Package size={23} aria-hidden="true" /></span>
          <div className="product-info">
            <strong>{productName(product)}</strong>
            <small>{productDescription(product)}{product.sku && ` · ${product.sku}`}</small>
            <div className="product-tags">
              <span className={`status-badge ${product.is_active ? '' : 'inactive'}`}>{product.is_active ? 'Aktif' : 'Nonaktif'}</span>
              {product.category_id && <small>{categoryNames.get(product.category_id)}</small>}
              {product.stock_qty !== null && <small>Stok {product.stock_qty.toLocaleString('id-ID')}</small>}
            </div>
          </div>
          <div className="product-money">
            <strong>{rupiah(product.sale_price)}</strong>
            {admin && snapshot.costs?.[product.id] !== undefined && <small>Modal {rupiah(snapshot.costs[product.id])}</small>}
          </div>
          {admin && <div className="row-actions">
            <button type="button" className="icon-button" aria-label={`Edit ${productName(product)} ${product.variant}`.trim()}
              onClick={() => setDialog({ kind: 'edit', product })}><Pencil size={18} /></button>
            <button type="button" className="icon-button" aria-label={`Riwayat ${productName(product)} ${product.variant}`.trim()}
              onClick={() => setDialog({ kind: 'history', product })}><Clock3 size={18} /></button>
            <button type="button" className="icon-button" aria-label={`Hapus ${productName(product)} ${product.variant}`.trim()}
              onClick={() => setDialog({ kind: 'delete', product })}><Trash2 size={18} /></button>
          </div>}
        </li>)}
      </ul> : <div className="empty"><Package size={30} />
        <h3>{products.length ? 'Produk tidak ditemukan' : 'Belum ada produk'}</h3>
        <p>{products.length ? 'Ubah kata pencarian atau filter.' : 'Belum ada barang yang tersedia di katalog toko.'}</p>
      </div>)}
    </section>

    {dialog?.kind === 'unlock' && <AdminDialog catalog={catalog} online={online} onClose={close} onUnlocked={() => saved('Mode admin terbuka.')} />}
    {admin && dialog?.kind === 'edit' && <ProductEditor product={dialog.product} cost={dialog.product ? snapshot?.costs?.[dialog.product.id] : undefined}
      categories={categories} catalog={catalog} onClose={close} onSaved={() => saved(dialog.product ? 'Perubahan produk tersimpan.' : 'Produk berhasil ditambahkan.')} />}
    {admin && dialog?.kind === 'history' && <HistoryDialog catalog={catalog} product={dialog.product} onClose={close} />}
    {admin && dialog?.kind === 'categories' && <CategoryDialog categories={categories} catalog={catalog} onClose={close} onSaved={saved} />}
    {admin && dialog?.kind === 'delete' && <DeleteDialog title="Hapus produk" label="Hapus produk" onClose={close}
      description={`${productName(dialog.product)} ${dialog.product.variant} akan dihapus dari katalog. Riwayat harganya tetap tersedia.`}
      remove={() => catalog.remove(dialog.product)} onDeleted={() => saved('Produk berhasil dihapus.')} />}
  </div>
}

const inputAmount = (value: number | null | undefined) => value?.toString().replace('.', ',') ?? ''

function ProductEditor({ product, cost, categories, catalog, onClose, onSaved }: {
  product: Product | null; cost?: number; categories: Category[]; catalog: Catalog; onClose: () => void; onSaved: () => void
}) {
  const [confirmation, setConfirmation] = useState<ProductDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(draft: ProductDraft) {
    setBusy(true)
    setError('')
    try {
      await catalog.save(draft, product)
      onSaved()
    } catch (failure) {
      setError(catalogErrorMessage(failure, 'Produk gagal disimpan. Coba lagi.'))
    } finally {
      setBusy(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const field = (key: string) => String(values.get(key) ?? '').trim()
    setError('')
    try {
      if (!field('name') || !field('unit')) throw new CatalogError('Nama barang dan satuan wajib diisi.')
      const draft: ProductDraft = {
        category_id: field('category') || null,
        name: field('name'), brand: field('brand'), variant: field('variant'), unit: field('unit'), sku: field('sku') || null,
        aliases: [...new Set(field('aliases').split(/[,\n]/).map((alias) => alias.trim()).filter(Boolean))],
        cost_price: parseAmount(field('cost'), 'Harga modal'),
        sale_price: parseAmount(field('sale'), 'Harga jual', true)!,
        stock_qty: parseAmount(field('stock'), 'Stok'),
        is_active: values.has('active'),
      }
      if (product && product.sale_price !== draft.sale_price) setConfirmation(draft)
      else void save(draft)
    } catch (failure) {
      setError(catalogErrorMessage(failure, 'Periksa kembali data produk.'))
    }
  }

  const title = confirmation ? 'Konfirmasi perubahan harga' : product ? 'Edit produk' : 'Tambah produk'
  return <Modal title={title} busy={busy} onClose={onClose}>
    {error && <Notice error>{error}</Notice>}
    <form onSubmit={submit} hidden={!!confirmation}>
      <div className="form-grid">
        <label>Nama barang <input required name="name" maxLength={100} defaultValue={product?.name} placeholder="Minyak goreng" /></label>
        <label>Merek <small>opsional</small><input name="brand" maxLength={80} defaultValue={product?.brand} placeholder="Bimoli" /></label>
        <label>Varian / ukuran <small>opsional</small><input name="variant" maxLength={80} defaultValue={product?.variant} placeholder="2 liter" /></label>
        <label>Satuan <input required name="unit" maxLength={40} defaultValue={product?.unit} placeholder="pouch" /></label>
        <label>Kategori <select name="category" aria-label="Kategori" defaultValue={product?.category_id ?? ''}>
          <option value="">Tanpa kategori</option>
          {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label>SKU <small>opsional</small><input name="sku" maxLength={60} defaultValue={product?.sku ?? ''} /></label>
        <label>Stok <small>opsional</small><input name="stock" inputMode="decimal" defaultValue={inputAmount(product?.stock_qty)} /></label>
        <label>Harga jual (Rp) <input required name="sale" inputMode="decimal" defaultValue={inputAmount(product?.sale_price)} placeholder="41000" /></label>
        <label>Harga modal (Rp) <small>opsional</small><input name="cost" inputMode="decimal" defaultValue={inputAmount(cost)} /></label>
        <label className="full-width">Alias pencarian <small>pisahkan dengan koma</small>
          <textarea name="aliases" rows={2} maxLength={800} defaultValue={product?.aliases.join(', ')} placeholder="minyak bimoli, minyak goreng bimoli" />
        </label>
        <label className="checkbox-label full-width"><input name="active" type="checkbox" defaultChecked={product?.is_active ?? true} /> Produk aktif dan dapat dicari</label>
      </div>
      <div className="modal-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Batal</button>
        <button type="submit" className="button primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan produk'}</button>
      </div>
    </form>
    {confirmation && product && <div className="confirmation">
      <p>Harga jual <strong>{productName(product)} {product.variant}</strong> akan diperbarui. Perubahan ini masuk ke riwayat harga.</p>
      <dl><div><dt>Harga lama</dt><dd>{rupiah(product.sale_price)}</dd></div><div><dt>Harga baru</dt><dd>{rupiah(confirmation.sale_price)}</dd></div></dl>
      <div className="modal-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={() => { setConfirmation(null); setError('') }}>Kembali</button>
        <button type="button" className="button primary" disabled={busy} onClick={() => void save(confirmation)}>
          {busy ? 'Menyimpan…' : 'Ya, ubah harga'}
        </button>
      </div>
    </div>}
  </Modal>
}

function HistoryDialog({ product, catalog, onClose }: {
  product: Product | null; catalog: Catalog; onClose: () => void
}) {
  const [entries, setEntries] = useState<PriceChange[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const request = new AbortController()
    setEntries(null)
    setError('')
    catalog.history(product?.id ?? null, request.signal).then((history) => {
      if (!request.signal.aborted) setEntries(history)
    }).catch((failure) => {
      if (!request.signal.aborted) setError(catalogErrorMessage(failure, 'Riwayat harga gagal dimuat.'))
    })
    return () => request.abort()
  }, [catalog, product])
  return <Modal title="Riwayat perubahan harga" onClose={onClose}>
    {product && <p className="history-product">{productName(product)} {product.variant}</p>}
    {error ? <Notice error>{error}</Notice> : entries === null
      ? <Loading>Memuat riwayat…</Loading> : entries.length ? <ul className="history-list">{entries.map((change) =>
        <li key={change.id}>
          {!product && <strong>{change.product_label}</strong>}
          <div className="history-prices"><span>{rupiah(change.old_price)}</span><span aria-hidden="true">→</span><strong>{rupiah(change.new_price)}</strong></div>
          <small>{localDateTime(change.changed_at)}</small>
        </li>
      )}</ul> : <div className="empty"><History size={28} /><h3>Belum ada perubahan harga</h3>
        <p>Perubahan berikutnya akan tercatat otomatis.</p></div>}
  </Modal>
}

function AdminDialog({ catalog, online, onClose, onUnlocked }: {
  catalog: Catalog; online: boolean; onClose: () => void; onUnlocked: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const pin = String(new FormData(form).get('pin') ?? '')
    form.reset()
    setBusy(true)
    setError('')
    try {
      await catalog.unlock(pin)
      onUnlocked()
    } catch (failure) {
      setError(catalogErrorMessage(failure, 'Mode admin gagal dibuka.'))
    } finally {
      setBusy(false)
    }
  }

  return <Modal title="Buka mode admin" busy={busy} onClose={onClose}>
    <p className="muted">Masukkan PIN toko untuk mengubah katalog serta melihat harga modal dan riwayat harga.</p>
    {error && <Notice error>{error}</Notice>}
    <form onSubmit={(event) => void submit(event)} className="dialog-form" autoComplete="off">
      <label>PIN admin <input name="pin" type="password" inputMode="numeric" autoComplete="off"
        required minLength={6} maxLength={12} pattern="[0-9]{6,12}" /></label>
      <div className="modal-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Batal</button>
        <button type="submit" className="button primary" disabled={busy || !online}>{busy ? 'Memeriksa…' : 'Verifikasi PIN'}</button>
      </div>
    </form>
  </Modal>
}

function CategoryDialog({ categories, catalog, onClose, onSaved }: {
  categories: Category[]; catalog: Catalog; onClose: () => void; onSaved: (message: string) => void
}) {
  const [editing, setEditing] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await catalog.saveCategory(name.trim(), editing)
      onSaved(editing ? 'Kategori diperbarui.' : 'Kategori berhasil ditambahkan.')
    } catch (failure) {
      setError(catalogErrorMessage(failure, 'Kategori gagal disimpan.'))
    } finally {
      setBusy(false)
    }
  }

  if (deleting) return <DeleteDialog title="Hapus kategori" label="Hapus kategori" onClose={() => setDeleting(null)}
    description={`Kategori ${deleting.name} akan dihapus. Produk di kategori ini tetap ada sebagai produk tanpa kategori.`}
    remove={() => catalog.removeCategory(deleting)} onDeleted={() => onSaved('Kategori berhasil dihapus.')} />

  return <Modal title="Kelola kategori" busy={busy} onClose={onClose}>
    {error && <Notice error>{error}</Notice>}
    <form onSubmit={(event) => void submit(event)} className="dialog-form">
      <label>{editing ? 'Ubah nama kategori' : 'Nama kategori'} <input required maxLength={80} value={name}
        onChange={(event) => setName(event.target.value)} /></label>
      <div className="modal-actions">
        {editing && <button type="button" className="button secondary" disabled={busy}
          onClick={() => { setEditing(null); setName(''); setError('') }}>Batal edit</button>}
        <button type="submit" className="button primary" disabled={busy || !name.trim()}>
          {busy ? 'Menyimpan…' : editing ? 'Simpan kategori' : 'Tambah kategori'}
        </button>
      </div>
    </form>
    {categories.length ? <ul className="category-list">{categories.map((item) => <li key={item.id}>
      <strong>{item.name}</strong>
      <button type="button" className="icon-button" aria-label={`Edit kategori ${item.name}`} disabled={busy}
        onClick={() => { setEditing(item); setName(item.name); setError('') }}><Pencil size={18} /></button>
      <button type="button" className="icon-button" aria-label={`Hapus kategori ${item.name}`} disabled={busy}
        onClick={() => setDeleting(item)}><Trash2 size={18} /></button>
    </li>)}</ul> : <p className="empty">Belum ada kategori.</p>}
  </Modal>
}

function DeleteDialog({ title, description, label, remove, onDeleted, onClose }: {
  title: string; description: string; label: string; remove: () => Promise<void>; onDeleted: () => void; onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setError('')
    setBusy(true)
    try {
      await remove()
      onDeleted()
    } catch (failure) {
      setError(catalogErrorMessage(failure, 'Data gagal dihapus.'))
    } finally {
      setBusy(false)
    }
  }

  return <Modal title={title} busy={busy} onClose={onClose}>
    <p>{description}</p>
    {error && <Notice error>{error}</Notice>}
    <div className="modal-actions">
      <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Batal</button>
      <button type="button" className="button danger" disabled={busy} onClick={() => void confirm()}>
        {busy ? 'Menghapus…' : label}
      </button>
    </div>
  </Modal>
}
