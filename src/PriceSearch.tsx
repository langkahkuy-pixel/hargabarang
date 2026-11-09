import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, AudioLines, CircleHelp, Mic, MicOff, PackageCheck, Search, Square, Volume2 } from 'lucide-react'
import { catalogErrorMessage, productDescription, productName, rupiah, type Catalog } from './catalog'
import { priceAnswer } from './price-answer'
import { matchProducts, type Choice } from './search'
import { useSpeech } from './speech'
import { Loading, Notice } from './ui'
import { useRecognition } from './voice'
import { displayWeight, weightPrice } from './weight-price'

type Result = { type: 'idle' | 'loading' }
  | { type: 'message'; title: string; detail: string; error?: boolean }
  | { type: 'choices'; items: Choice[] }
  | ({ type: 'price'; amount: number; rounded: boolean } & Choice)

const examples = ['Minyak Bimoli 2 liter', 'Gula pasir setengah kilo', 'Beras curah dua kilo']
const missingSpeech = 'Barang tidak ditemukan.'
export default function PriceSearch({ catalog }: { catalog: Pick<Catalog, 'getActive' | 'searchCatalog'> }) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<Result>({ type: 'idle' })
  const [lastQuery, setLastQuery] = useState('')
  const request = useRef<AbortController | null>(null)
  const resultArea = useRef<HTMLDivElement>(null)
  const { available, speaking, playing, error: speechError, prepare, speak, stop } = useSpeech()

  const clearResult = useCallback(() => {
    request.current?.abort()
    stop()
    setResult({ type: 'idle' })
    setLastQuery('')
  }, [stop])

  async function search(input: string, alternatives: string[] = [], choice?: Choice) {
    clearResult()
    if (!input.trim()) {
      setResult({ type: 'message', title: 'Ketik nama barang', detail: 'Gunakan nama, merek, ukuran, atau SKU untuk mencari.' })
      return
    }
    const current = new AbortController()
    request.current = current
    setLastQuery(input.trim())
    setResult({ type: 'loading' })
    try {
      const selected = choice ? await catalog.getActive(choice.product.id, current.signal) : null
      const match = choice
        ? (selected && (choice.grams === undefined || selected.weight_rounding !== undefined)
          ? { kind: 'found' as const, product: selected, grams: choice.grams } : { kind: 'missing' as const })
        : matchProducts(await catalog.searchCatalog(current.signal), input, alternatives)
      if (current.signal.aborted) return
      if (match.kind === 'found') {
        const quote = match.grams === undefined
          ? { amount: match.product.sale_price, rounded: false }
          : weightPrice(match.product, match.grams)
        const price = { type: 'price' as const, product: match.product, grams: match.grams, ...quote }
        setResult(price)
        speak(priceAnswer(price))
      } else if (match.kind === 'choices') {
        setResult({ type: 'choices', items: match.choices })
        if (alternatives.length) speak('Pilih barang yang dimaksud pada layar.')
      } else {
        setResult({
          type: 'message', title: match.kind === 'empty' ? 'Sebutkan nama barang' : 'Barang tidak ditemukan',
          detail: 'Coba gunakan nama atau merek yang lebih spesifik.',
        })
        if (match.kind === 'missing') speak(missingSpeech)
      }
    } catch (error) {
      if (!current.signal.aborted) setResult({
        type: 'message', title: 'Harga gagal dimuat',
        detail: catalogErrorMessage(error, 'Penyimpanan lokal gagal dibaca. Coba lagi.'), error: true,
      })
    }
  }

  const voice = useRecognition((phrase, alternatives) => {
    setQuery(phrase)
    void search(phrase, alternatives)
  })
  const { cancel } = voice
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    if (result.type !== 'idle' && result.type !== 'loading') {
      resultArea.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [result])

  function manual(event: FormEvent) {
    event.preventDefault()
    prepare()
    cancel()
    void search(query)
  }

  const recording = voice.phase !== 'idle'
  const micLabel = {
    idle: 'Tanya Harga', requesting: 'Meminta izin…', listening: 'Selesai bicara', finishing: 'Memproses suara…',
  }[voice.phase]
  const micHint = {
    idle: 'Ketuk mikrofon, lalu sebutkan nama barang.',
    requesting: 'Izinkan penggunaan mikrofon di browser.',
    listening: 'Sedang mendengarkan. Sebutkan nama barang.',
    finishing: 'Menunggu hasil pengenalan suara.',
  }[voice.phase]

  return <div className="search-page">
    <div className="page-heading">
      <div className="eyebrow"><span className="status-dot" /> PENCARIAN HARGA</div>
      <h1>Tanya harga barang</h1>
      <p>Sebutkan atau ketik nama barang. Untuk barang curah, sertakan berat dalam gram, ons, atau kilo.</p>
    </div>

    <section className={`voice-card ${recording ? 'voice-active' : ''}`} aria-label="Pencarian dengan suara">
      <div className="voice-decoration" aria-hidden="true"><i /><i /><i /></div>
      <div className="voice-tag"><AudioLines size={16} /> PENCARIAN SUARA</div>
      <button className="mic-button" type="button" aria-label={micLabel}
        disabled={!voice.supported || voice.phase === 'requesting' || voice.phase === 'finishing'}
        onClick={() => {
          if (voice.phase === 'listening') voice.finish()
          else { clearResult(); prepare(); voice.start() }
        }}>
        {!voice.supported ? <MicOff size={34} /> : voice.phase === 'listening' ? <Square size={30} /> : <Mic size={36} />}
      </button>
      <strong className="voice-title">{micLabel}</strong>
      <p className="voice-hint" role="status">{voice.supported ? micHint : 'Mikrofon tidak tersedia di browser atau koneksi ini.'}</p>
      {recording && <button type="button" className="voice-cancel" onClick={cancel}>Batalkan</button>}
    </section>

    {voice.error && <Notice error>{voice.error}</Notice>}
    {voice.transcript && <div className="transcript" aria-live="polite">
      <AudioLines size={18} aria-hidden="true" /><div><strong>Transkripsi suara</strong><p>{voice.transcript}</p></div>
    </div>}

    <section className="search-card" aria-label="Pencarian manual">
      <form onSubmit={manual}>
        <label htmlFor="product-search">Cari dengan mengetik</label>
        <div className="search-field">
          <div className="input-icon"><Search size={20} aria-hidden="true" />
            <input id="product-search" type="search" autoComplete="off" maxLength={180} placeholder="Contoh: minyak Bimoli 2 liter"
              value={query} onChange={(event) => {
                cancel()
                clearResult()
                setQuery(event.target.value)
              }} />
          </div>
          <button type="submit" className="button primary">Cari <ArrowRight size={18} aria-hidden="true" /></button>
        </div>
      </form>
      <div className="examples">
        <span>Contoh pencarian</span>
        <div className="chips">{examples.map((example) =>
          <button className="chip" type="button" key={example} onClick={() => {
            prepare()
            cancel()
            setQuery(example)
            void search(example)
          }}>{example}</button>,
        )}</div>
      </div>
    </section>

    <div ref={resultArea} hidden={result.type === 'idle'}>
      {result.type === 'loading' && <Loading>Mencari harga di katalog toko…</Loading>}
      {result.type === 'message' && (result.error
        ? <Notice error><strong>{result.title}</strong><p>{result.detail}</p></Notice>
        : <section className="empty result-card" role="status">
          <CircleHelp size={28} aria-hidden="true" /><h2>{result.title}</h2><p>{result.detail}</p>
        </section>)}
      {result.type === 'choices' && <section className="result-card" aria-labelledby="choices-title">
        <h2 id="choices-title">Pilih barang yang dimaksud</h2>
        <p className="muted" role="status">Hasil untuk “{lastQuery}”. Ketuk barang untuk melihat harganya.</p>
        <ul className="choice-list">{result.items.map(({ product, grams }) =>
          <li key={`${product.id}:${grams ?? ''}`}><button type="button" className="choice" onClick={() => {
            prepare()
            void search(lastQuery, [], { product, grams })
          }}>
            <span><strong>{productName(product)}</strong><small>{grams === undefined ? productDescription(product) : `${displayWeight(grams)} · harga curah`}{product.sku && ` · ${product.sku}`}</small></span>
            <ArrowRight size={20} aria-hidden="true" />
          </button></li>,
        )}</ul>
      </section>}
      {result.type === 'price' && <section className="result-card price-card" aria-label="Hasil harga">
        <div role="status">
          <div className="eyebrow"><PackageCheck size={18} /> HARGA JUAL</div>
          <h2>{productName(result.product)}</h2>
          <p className="muted">{result.grams === undefined
            ? productDescription(result.product)
            : `${displayWeight(result.grams)} · ${rupiah(result.product.sale_price)} per kg`}</p>
          <p className="price">{rupiah(result.amount)}</p>
          {result.rounded && <p className="muted">Dibulatkan ke atas ke kelipatan {rupiah(result.product.weight_rounding!)}.</p>}
        </div>
        {available
          ? <button type="button" className="button secondary" onClick={() => speaking ? stop() : speak(priceAnswer(result))}>
            {speaking ? <Square size={18} /> : <Volume2 size={19} />} {speaking ? 'Hentikan suara' : 'Bacakan harga'}
          </button>
          : <small className="muted">Suara bahasa Indonesia belum tersedia di perangkat ini.</small>}
        {speaking && <small className="muted" role="status">{playing ? 'Sedang membacakan harga.' : 'Menyiapkan suara…'}</small>}
        {speechError && <Notice error>{speechError}</Notice>}
      </section>}
    </div>
    <p className="search-footnote"><CircleHelp size={16} aria-hidden="true" /> Harga berasal dari katalog toko Anda.</p>
  </div>
}
