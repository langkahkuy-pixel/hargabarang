import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowRight, AudioLines, LayoutDashboard, LogOut, Search, ShieldCheck, Store, WifiOff } from 'lucide-react'
import { catalogErrorMessage, type Member } from './catalog'
import Dashboard from './Dashboard'
import { demoCatalog, demoMember, demoSessionKey } from './demo'
import PriceSearch from './PriceSearch'
import { canDemo, loadMember, storeCatalog, supabase } from './supabase'
import { Brand, Loading, Notice } from './ui'

type ProfileState = { userId: string; member?: Member; error?: string }
const route = () => window.location.hash === '#dashboard' ? 'dashboard' : 'search'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null)
  const [profile, setProfile] = useState<ProfileState | null>(null)
  const [revision, setRevision] = useState(0)
  const [demo, setDemo] = useState(() => canDemo && localStorage.getItem(demoSessionKey) === 'true')
  const [page, setPage] = useState(route)
  const [online, setOnline] = useState(navigator.onLine)
  const [logoutError, setLogoutError] = useState('')
  const [leaving, setLeaving] = useState(false)
  const userId = session?.user.id
  const email = session?.user.email ?? ''
  const member = demo ? demoMember : userId && profile?.userId === userId ? profile.member : undefined
  const catalog = useMemo(() => member ? demo ? demoCatalog : storeCatalog(member) : null, [member, demo])

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

  useEffect(() => {
    const subscription = supabase?.auth.onAuthStateChange((_, next) => setSession(next))
    return () => subscription?.data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!userId || !online) return
    const request = new AbortController()
    setProfile(null)
    loadMember(userId, email, request.signal).then((next) => {
      if (!request.signal.aborted) setProfile({ userId, member: next })
    }).catch((error) => {
      if (!request.signal.aborted) setProfile({
        userId, error: catalogErrorMessage(error, 'Akses toko gagal dimuat. Coba lagi.'),
      })
    })
    return () => request.abort()
  }, [userId, email, revision, online])

  async function logout() {
    setLeaving(true)
    setLogoutError('')
    try {
      if (demo) {
        localStorage.removeItem(demoSessionKey)
        setDemo(false)
      } else {
        const response = await supabase?.auth.signOut({ scope: 'local' })
        if (response?.error) throw response.error
      }
      setProfile(null)
      window.location.hash = '#cari'
    } catch {
      setLogoutError('Keluar gagal. Periksa koneksi lalu coba lagi.')
    } finally {
      setLeaving(false)
    }
  }

  function enterDemo() {
    localStorage.setItem(demoSessionKey, 'true')
    window.location.hash = '#cari'
    setDemo(true)
  }

  const dashboard = page === 'dashboard' && member?.role === 'owner'
  return <>
    <a className="skip-link" href="#main-content" onClick={(event) => {
      event.preventDefault()
      document.getElementById('main-content')?.focus()
    }}>Lewati ke konten</a>
    <header className="app-header">
      <div className="header-inner">
        <a className="brand-link" href="#cari" aria-label="Asisten Harga, beranda"><Brand /></a>
        {member && <>
          <nav className="app-nav" aria-label="Navigasi utama">
            <a href="#cari" aria-current={dashboard ? undefined : 'page'}><Search size={18} /> Cari Harga</a>
            {member.role === 'owner' && <a href="#dashboard" aria-current={dashboard ? 'page' : undefined}><LayoutDashboard size={18} /> Dashboard</a>}
          </nav>
          <div className="header-account">
            <span className="store-pill"><Store size={16} /> {member.storeName}</span>
            <button type="button" className="icon-button logout" aria-label="Keluar" title="Keluar" onClick={() => void logout()} disabled={leaving}><LogOut size={19} /></button>
          </div>
        </>}
      </div>
    </header>
    <main id="main-content" tabIndex={-1} className="shell">
      {!online && <div className="offline" role="alert"><WifiOff size={19} /> Perangkat offline. Harga terkini belum bisa dimuat.</div>}
      {demo && <div className="demo-banner"><span className="status-dot" /><strong>Mode demo lokal</strong><span>Data contoh tersimpan di browser ini.</span></div>}
      {logoutError && <Notice error>{logoutError}</Notice>}
      {member && catalog ? dashboard
        ? <Dashboard key={member.userId} member={member} catalog={catalog} online={online} />
        : <PriceSearch key={member.userId} catalog={catalog} online={online} />
        : session === undefined
          ? <Loading>Memeriksa sesi…</Loading>
          : userId
            ? <section className="account-state">
              {profile?.userId === userId && profile.error
                ? <Notice error>{profile.error}</Notice>
                : online ? <Loading>Memuat akses toko…</Loading> : <Notice>Sambungkan perangkat untuk memeriksa akses toko.</Notice>}
              <div className="account-actions">
                {profile?.userId === userId && profile.error && <button type="button" className="button primary" disabled={!online}
                  onClick={() => setRevision((value) => value + 1)}>Coba lagi</button>}
                <button type="button" className="button secondary" onClick={() => void logout()} disabled={leaving}>Keluar</button>
              </div>
            </section>
            : <Login online={online} onDemo={enterDemo} />}
    </main>
    <footer className="app-footer"><span>Asisten Harga</span><span>Untuk toko sembako Anda</span></footer>
  </>
}

function Login({ online, onDemo }: { online: boolean; onDemo: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    const values = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const { error: failure } = await supabase.auth.signInWithPassword({
        email: String(values.get('email')).trim(), password: String(values.get('password')),
      })
      if (failure) setError(failure.code === 'invalid_credentials'
        ? 'Email atau kata sandi salah.' : 'Gagal masuk. Periksa koneksi atau hubungi pengelola toko.')
    } catch {
      setError('Gagal menghubungi layanan masuk. Coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="login-layout">
    <section className="login-card">
      <div className="eyebrow"><ShieldCheck size={18} /> AKSES TOKO</div>
      <h1>Masuk ke toko</h1>
      <p className="muted">Gunakan akun yang diberikan pengelola toko untuk membuka katalog harga.</p>
      {error && <Notice error>{error}</Notice>}
      {!supabase && <Notice>{canDemo
        ? 'Supabase belum dikonfigurasi. Anda bisa mencoba katalog contoh melalui mode demo.'
        : 'Konfigurasi Supabase belum lengkap. Hubungi pengelola aplikasi.'}</Notice>}
      <form className="login-form" onSubmit={(event) => void login(event)}>
        <label>Email <input type="email" name="email" autoComplete="username" placeholder="nama@contoh.id" required disabled={!supabase} /></label>
        <label>Kata sandi <input type="password" name="password" autoComplete="current-password" required disabled={!supabase} /></label>
        <button type="submit" className="button primary" disabled={!supabase || busy || !online}>
          {busy ? 'Sedang masuk…' : 'Masuk'} <ArrowRight size={19} />
        </button>
      </form>
      {canDemo && <button type="button" className="button secondary demo-button" onClick={onDemo}>Buka demo lokal <ArrowRight size={19} /></button>}
    </section>
    <aside className="login-feature">
      <div className="voice-decoration" aria-hidden="true"><i /><i /><i /></div>
      <div className="feature-symbol"><AudioLines size={43} aria-hidden="true" /></div>
      <h2>Tanya harga.<br />Langsung terdengar.</h2>
      <p>Cari harga jual dengan suara atau teks, lalu kelola produk dan riwayat harga dari satu tempat.</p>
    </aside>
  </div>
}
