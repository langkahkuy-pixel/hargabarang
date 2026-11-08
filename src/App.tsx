import { useEffect, useState } from 'react'
import { LayoutDashboard, Mic, WifiOff } from 'lucide-react'
import Dashboard from './Dashboard'
import PriceSearch from './PriceSearch'
import { storeCatalog } from './store-api'
import { Brand } from './ui'

const route = () => window.location.hash === '#cari' ? 'search' : 'dashboard'

export default function App() {
  const [page, setPage] = useState(route)
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    const navigate = () => {
      setPage(route())
      window.scrollTo(0, 0)
    }
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    window.addEventListener('hashchange', navigate)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      window.removeEventListener('hashchange', navigate)
    }
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
      {!online && <div className="offline" role="alert"><WifiOff size={19} /> Perangkat offline. Harga terkini belum bisa dimuat.</div>}
      {dashboard ? <Dashboard catalog={storeCatalog} online={online} /> : <PriceSearch catalog={storeCatalog} online={online} />}
    </main>
    <footer className="app-footer"><span>Asisten Harga</span><span>Untuk toko sembako Anda</span></footer>
  </>
}
