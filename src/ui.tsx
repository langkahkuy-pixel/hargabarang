import { useEffect, useRef, type ReactNode } from 'react'
import { AlertCircle, LoaderCircle, Store, X } from 'lucide-react'

export function Brand() {
  return <div className="brand">
    <span className="brand-icon"><Store size={22} aria-hidden="true" /></span>
    <span><strong>Asisten Harga</strong><small>TOKO SEMBAKO</small></span>
  </div>
}

export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={`notice ${error ? 'notice-error' : ''}`} role={error ? 'alert' : 'status'}>
    <AlertCircle size={19} aria-hidden="true" /><div>{children}</div>
  </div>
}

export function Loading({ children }: { children: ReactNode }) {
  return <div className="loading" role="status"><LoaderCircle size={21} className="spinner" aria-hidden="true" /> {children}</div>
}

export function Modal({ title, onClose, children, busy = false }: {
  title: string; onClose: () => void; children: ReactNode; busy?: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  return <dialog ref={dialog} className="modal" aria-labelledby="dialog-title" onCancel={(event) => {
    event.preventDefault()
    if (!busy) onClose()
  }}>
    <div className="modal-head">
      <h2 id="dialog-title">{title}</h2>
      <button type="button" className="icon-button" aria-label="Tutup" onClick={onClose} disabled={busy}><X size={23} /></button>
    </div>
    <div className="modal-content">{children}</div>
  </dialog>
}
