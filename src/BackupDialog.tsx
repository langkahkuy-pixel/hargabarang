import { useState } from 'react'
import { Download } from 'lucide-react'
import type { Backup } from '../shared/store'
import { parseBackup } from './backup'
import { catalogErrorMessage, type Catalog } from './catalog'
import { Modal, Notice } from './ui'

export default function BackupDialog({ catalog, onClose, onImported }: {
  catalog: Catalog; onClose: () => void; onImported: () => void
}) {
  const [pending, setPending] = useState<Backup | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function choose(file: File) {
    setPending(null)
    setError('')
    setBusy(true)
    try {
      setPending(parseBackup(await file.text()))
    } catch (failure) {
      setError(catalogErrorMessage(failure, 'File cadangan gagal dibaca.'))
    } finally {
      setBusy(false)
    }
  }

  async function download() {
    setBusy(true)
    setError('')
    try {
      const data = await catalog.exportBackup()
      const file = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = url
      link.download = `asisten-harga-${new Date().toISOString().slice(0, 10)}.json`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (failure) {
      setError(catalogErrorMessage(failure, 'Cadangan gagal diekspor.'))
    } finally {
      setBusy(false)
    }
  }

  async function restore(backup: Backup) {
    setBusy(true)
    setError('')
    try {
      await catalog.importBackup(backup)
      onImported()
    } catch (failure) {
      setError(catalogErrorMessage(failure, 'Cadangan gagal diimpor.'))
    } finally {
      setBusy(false)
    }
  }

  return <Modal title="Cadangan data" busy={busy} onClose={onClose}>
    <p className="muted">Unduh cadangan JSON berisi katalog, harga modal, kategori, dan riwayat harga.</p>
    {error && <Notice error>{error}</Notice>}
    <div className="dialog-form">
      <button type="button" className="button secondary" disabled={busy} onClick={() => void download()}><Download size={18} /> Ekspor JSON</button>
    </div>
    <div className="dialog-form">
      <label>Pilih file cadangan JSON <input type="file" accept=".json,application/json" disabled={busy}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) void choose(file)
        }} /></label>
    </div>
    {pending && <div className="dialog-form">
      <Notice>Cadangan valid. {pending.products.filter((product) => product.deleted_at === null).length} produk, {pending.categories.length} kategori, dan {pending.history.length} perubahan harga.</Notice>
      <p className="dialog-form">Impor akan mengganti seluruh katalog dan riwayat di browser ini.</p>
      <div className="modal-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={() => setPending(null)}>Batal impor</button>
        <button type="button" className="button danger" disabled={busy} onClick={() => void restore(pending)}>
          {busy ? 'Memproses…' : 'Ganti data dengan cadangan'}
        </button>
      </div>
    </div>}
  </Modal>
}
