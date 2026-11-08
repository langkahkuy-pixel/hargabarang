import { useEffect, useState, type FormEvent } from 'react'
import { Clock3, History, Package, Pencil, Plus, RefreshCw, Search, TrendingUp } from 'lucide-react'
import {
  CatalogError, catalogErrorMessage, localDateTime, parseAmount, productDescription, productName, rupiah, startOfStoreDay,
  type Catalog, type Member, type PriceChange, type Product, type ProductDraft,
} from './catalog'
import { searchTokens } from './search'
import { Loading, Modal, Notice } from './ui'

type Snapshot = { products: Product[]; costs: Map<string, number>; changed: number }
type View = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'loaded'; snapshot: Snapshot }
type Dialog = { kind: 'edit'; product: Product | null } | { kind: 'history'; product: Product | null }

function filterProducts(products: Product[], query: string, status: string) {
  const tokens = searchTokens(query)
  const normalized = query.trim().toLocaleLowerCase('id')
  return products.filter((product) => {
    if (status === 'active' && !product.is_active) return false
    if (status === 'inactive' && product.is_active) return false
    const source = [productName(product), product.variant, product.unit, product.sku ?? '', ...product.aliases].join(' ')
    const indexed = searchTokens(source)
    return !normalized || source.toLocaleLowerCase('id').includes(normalized)
      || (tokens.length > 0 && tokens.every((token) => indexed.some((part) => part.startsWith(token))))
  })
}

export default function Dashboard({ member, catalog, online }: { member: Member; catalog: Catalog; online: boolean }) {
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [revision, setRevision] = useState(0)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!online) return
    const request = new AbortController()
    setView({ kind: 'loading' })
    void Promise.all([
      catalog.list(false, request.signal),
      catalog.costs(request.signal),
      catalog.history(null, startOfStoreDay(), request.signal),
    ]).then(([products, costs, history]) => {
      if (request.signal.aborted) return
      products.sort((left, right) => productName(left).localeCompare(productName(right), 'id')
        || left.variant.localeCompare(right.variant, 'id', { numeric: true }))
      setView({ kind: 'loaded', snapshot: { products, costs, changed: new Set(history.map((change) => change.product_id)).size } })
    }).catch((error) => {
      if (!request.signal.aborted) setView({ kind: 'error', message: catalogErrorMessage(error, 'Katalog gagal dimuat.') })
    })
    return () => request.abort()
  }, [catalog, online, revision])

  const snapshot = view.kind === 'loaded' ? view.snapshot : null
  const products = snapshot?.products ?? []
  const filtered = filterProducts(products, query, status)
  const refresh = () => setRevision((value) => value + 1)

  return <div className="dashboard">
    <div className="page-heading dashboard-heading">
      <div>
        <div className="eyebrow"><span className="status-dot" /> MANAJEMEN TOKO</div>
        <h1>Dashboard produk</h1>
        <p>Kelola katalog, harga jual, dan riwayat perubahan toko.</p>
      </div>
      <button type="button" className="button primary" disabled={!online} onClick={() => setDialog({ kind: 'edit', product: null })}>
        <Plus size={20} /> Tambah produk
      </button>
    </div>

    <div className="metrics">
      <div className="metric"><span className="metric-icon"><Package size={24} /></span>
        <div><strong>{online && snapshot ? products.filter((product) => product.is_active).length : '—'}</strong><span>Produk aktif</span></div>
      </div>
      <div className="metric"><span className="metric-icon amber"><TrendingUp size={24} /></span>
        <div><strong>{online && snapshot ? snapshot.changed : '—'}</strong><span>Produk berubah harga hari ini</span></div>
      </div>
    </div>

    {success && <div className="success" role="status">{success}</div>}
    <section className="catalog-card" aria-labelledby="catalog-title">
      <div className="catalog-head">
        <div><h2 id="catalog-title">Katalog produk</h2><p className="muted">Barang dan harga yang tersimpan di toko.</p></div>
        <div className="catalog-actions">
          <button type="button" className="button secondary" disabled={!online}
            onClick={() => setDialog({ kind: 'history', product: null })}><History size={18} /> Riwayat harga</button>
          <button type="button" className="icon-button" disabled={!online} onClick={refresh} aria-label="Muat ulang katalog"><RefreshCw size={19} /></button>
        </div>
      </div>
      <div className="filters">
        <div className="input-icon"><Search size={19} aria-hidden="true" />
          <input aria-label="Cari produk di katalog" type="search" placeholder="Cari produk, merek, atau SKU"
            value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <select aria-label="Status produk" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">Semua status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option>
        </select>
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
              {product.stock_qty !== null && <small>Stok {product.stock_qty.toLocaleString('id-ID')}</small>}
            </div>
          </div>
          <div className="product-money">
            <strong>{rupiah(product.sale_price)}</strong>
            {snapshot.costs.has(product.id) && <small>Modal {rupiah(snapshot.costs.get(product.id)!)}</small>}
          </div>
          <div className="row-actions">
            <button type="button" className="icon-button" aria-label={`Edit ${productName(product)} ${product.variant}`.trim()}
              onClick={() => setDialog({ kind: 'edit', product })}><Pencil size={18} /></button>
            <button type="button" className="icon-button" aria-label={`Riwayat ${productName(product)} ${product.variant}`.trim()}
              onClick={() => setDialog({ kind: 'history', product })}><Clock3 size={18} /></button>
          </div>
        </li>)}
      </ul> : <div className="empty"><Package size={30} />
        <h3>{products.length ? 'Produk tidak ditemukan' : 'Belum ada produk'}</h3>
        <p>{products.length ? 'Ubah kata pencarian atau filter status.' : 'Tambahkan barang pertama ke katalog toko.'}</p>
      </div>)}
    </section>

    {dialog?.kind === 'edit' && <ProductEditor product={dialog.product} cost={dialog.product ? snapshot?.costs.get(dialog.product.id) : undefined}
      catalog={catalog} online={online} onClose={() => setDialog(null)} onSaved={() => {
        setDialog(null)
        setSuccess(dialog.product ? 'Perubahan produk tersimpan.' : 'Produk berhasil ditambahkan.')
        refresh()
      }} />}
    {dialog?.kind === 'history' && <HistoryDialog catalog={catalog} member={member} products={products} product={dialog.product}
      online={online} onClose={() => setDialog(null)} />}
  </div>
}

const inputAmount = (value: number | null | undefined) => value?.toString().replace('.', ',') ?? ''

function ProductEditor({ product, cost, catalog, online, onClose, onSaved }: {
  product: Product | null; cost?: number; catalog: Catalog; online: boolean; onClose: () => void; onSaved: () => void
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
    {!online && <Notice error>Perangkat offline. Sambungkan kembali untuk menyimpan.</Notice>}
    <form onSubmit={submit} hidden={!!confirmation}>
      <div className="form-grid">
        <label>Nama barang <input required name="name" maxLength={100} defaultValue={product?.name} placeholder="Minyak goreng" /></label>
        <label>Merek <small>opsional</small><input name="brand" maxLength={80} defaultValue={product?.brand} placeholder="Bimoli" /></label>
        <label>Varian / ukuran <small>opsional</small><input name="variant" maxLength={80} defaultValue={product?.variant} placeholder="2 liter" /></label>
        <label>Satuan <input required name="unit" maxLength={40} defaultValue={product?.unit} placeholder="pouch" /></label>
        <label>SKU <small>opsional</small><input name="sku" maxLength={60} defaultValue={product?.sku ?? ''} /></label>
        <label>Stok <small>opsional</small><input name="stock" inputMode="decimal" defaultValue={inputAmount(product?.stock_qty)} /></label>
        <label>Harga jual (Rp) <input required name="sale" inputMode="decimal" defaultValue={inputAmount(product?.sale_price)} placeholder="41000" /></label>
        <label>Harga modal (Rp) <small>khusus owner</small><input name="cost" inputMode="decimal" defaultValue={inputAmount(cost)} /></label>
        <label className="full-width">Alias pencarian <small>pisahkan dengan koma</small>
          <textarea name="aliases" rows={2} maxLength={800} defaultValue={product?.aliases.join(', ')} placeholder="minyak bimoli, minyak goreng bimoli" />
        </label>
        <label className="checkbox-label full-width"><input name="active" type="checkbox" defaultChecked={product?.is_active ?? true} /> Produk aktif dan dapat dicari</label>
      </div>
      <div className="modal-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Batal</button>
        <button type="submit" className="button primary" disabled={busy || !online}>{busy ? 'Menyimpan…' : 'Simpan produk'}</button>
      </div>
    </form>
    {confirmation && product && <div className="confirmation">
      <p>Harga jual <strong>{productName(product)} {product.variant}</strong> akan diperbarui. Perubahan ini masuk ke riwayat harga.</p>
      <dl><div><dt>Harga lama</dt><dd>{rupiah(product.sale_price)}</dd></div><div><dt>Harga baru</dt><dd>{rupiah(confirmation.sale_price)}</dd></div></dl>
      <div className="modal-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={() => { setConfirmation(null); setError('') }}>Kembali</button>
        <button type="button" className="button primary" disabled={busy || !online} onClick={() => void save(confirmation)}>
          {busy ? 'Menyimpan…' : 'Ya, ubah harga'}
        </button>
      </div>
    </div>}
  </Modal>
}

function HistoryDialog({ product, products, catalog, member, online, onClose }: {
  product: Product | null; products: Product[]; catalog: Catalog; member: Member; online: boolean; onClose: () => void
}) {
  const [entries, setEntries] = useState<PriceChange[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!online) return
    const request = new AbortController()
    setEntries(null)
    setError('')
    catalog.history(product?.id ?? null, null, request.signal).then((history) => {
      if (!request.signal.aborted) setEntries(history)
    }).catch((failure) => {
      if (!request.signal.aborted) setError(catalogErrorMessage(failure, 'Riwayat harga gagal dimuat.'))
    })
    return () => request.abort()
  }, [catalog, product, online])
  return <Modal title="Riwayat perubahan harga" onClose={onClose}>
    {product && <p className="history-product">{productName(product)} {product.variant}</p>}
    {!online ? <Notice>Riwayat tersedia saat perangkat terhubung.</Notice> : error ? <Notice error>{error}</Notice> : entries === null
      ? <Loading>Memuat riwayat…</Loading> : entries.length ? <ul className="history-list">{entries.map((change) => {
        const item = products.find((row) => row.id === change.product_id)
        return <li key={change.id}>
          {!product && item && <strong>{productName(item)} {item.variant}</strong>}
          <div className="history-prices"><span>{rupiah(change.old_price)}</span><span aria-hidden="true">→</span><strong>{rupiah(change.new_price)}</strong></div>
          <small>{localDateTime(change.changed_at)} · {change.changed_by === member.userId ? 'Anda' : `ID akun ${change.changed_by}`}</small>
        </li>
      })}</ul> : <div className="empty"><History size={28} /><h3>Belum ada perubahan harga</h3>
        <p>Perubahan berikutnya akan tercatat otomatis.</p></div>}
  </Modal>
}
