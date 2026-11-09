import { useEffect, useState } from 'react'
import { LayoutDashboard, Mic } from 'lucide-react'
import Dashboard from './Dashboard'
import PriceSearch from './PriceSearch'
import { storeCatalog } from './local-catalog'
import { Brand } from './ui'

const route = () => window.location.hash === '#cari' ? 'search' : 'dashboard'

export default function App() {
  const [page, setPage] = useState(route)
  const [adminUntil, setAdminUntil] = useState(0)

  useEffect(() => {
    const navigate = () => {
      setPage(route())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [])

  const dashboard = page === 'dashboard'
  return <>
    <a className="skip-link" href="#main-content" onClick={(event) => {
      event.preventDefault()
      document.getElementById('main-content')?.focus()
    }}>Lewati ke konten</a>
    <header className="app-header">
      <div className="header-inner">
        <a className="brand-link" href="#dashboard" aria-label="Asisten Harga, beranda"><Brand /></a>
        <nav className="app-nav" aria-label="Navigasi utama">
          <a href="#dashboard" aria-current={dashboard ? 'page' : undefined}><LayoutDashboard size={18} /> Dashboard</a>
          <a href="#cari" aria-current={dashboard ? undefined : 'page'}><Mic size={18} /> Cari Harga</a>
        </nav>
      </div>
    </header>
    <main id="main-content" tabIndex={-1} className="shell">
      {dashboard
        ? <Dashboard catalog={storeCatalog} adminUntil={adminUntil} setAdminUntil={setAdminUntil} />
        : <PriceSearch catalog={storeCatalog} />}
    </main>
    <footer className="app-footer"><span>Asisten Harga</span><span>Untuk toko sembako Anda</span></footer>
  </>
}
