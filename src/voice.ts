import { useCallback, useEffect, useRef, useState } from 'react'

type Alternative = { transcript: string }
type RecognitionResult = ArrayLike<Alternative> & { isFinal: boolean }
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> }
type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type VoiceWindow = Window & {
  SpeechRecognition?: new () => Recognition
  webkitSpeechRecognition?: new () => Recognition
}

const recognitionClass = () => (window as VoiceWindow).SpeechRecognition ?? (window as VoiceWindow).webkitSpeechRecognition
type Phase = 'idle' | 'requesting' | 'listening' | 'finishing'
const messages: Record<string, string> = {
  'not-allowed': 'Izin mikrofon ditolak. Izinkan mikrofon di pengaturan browser, atau ketik nama barang.',
  'service-not-allowed': 'Layanan pengenalan suara tidak tersedia. Ketik nama barang untuk mencari.',
  'audio-capture': 'Mikrofon tidak ditemukan. Anda bisa mencari dengan mengetik.',
  'no-speech': 'Suara belum terdengar. Coba lagi dan ucapkan nama barang dengan jelas.',
  'network': 'Layanan suara gagal terhubung. Pencarian dengan mengetik tetap tersedia.',
  'language-not-supported': 'Pengenalan suara bahasa Indonesia belum tersedia di perangkat ini. Silakan ketik nama barang.',
}

export function useRecognition(onPhrase: (phrase: string, alternatives: string[]) => void) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')
  const active = useRef<Recognition | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const phraseHandler = useRef(onPhrase)
  useEffect(() => { phraseHandler.current = onPhrase }, [onPhrase])

  const release = useCallback(() => {
    const recognition = active.current
    active.current = null
    window.clearTimeout(timer.current)
    if (recognition) recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null
    return recognition
  }, [])

  const abort = useCallback(() => {
    try { release()?.abort() } catch { /* Recognition may already have ended. */ }
  }, [release])

  useEffect(() => abort, [abort])

  const cancel = useCallback(() => {
    abort()
    setPhase('idle')
    setTranscript('')
    setError('')
  }, [abort])

  function finish() {
    const recognition = active.current
    if (!recognition) return
    window.clearTimeout(timer.current)
    setPhase('finishing')
    timer.current = window.setTimeout(() => {
      abort()
      setPhase('idle')
      setError('Layanan suara terlalu lama merespons. Coba lagi atau ketik nama barang.')
    }, 4000)
    try { recognition.stop() } catch {
      abort()
      setPhase('idle')
      setError('Pengenalan suara terhenti. Silakan coba lagi.')
    }
  }

  function start() {
    if (active.current) return
    const Recognition = recognitionClass()
    setError('')
    setTranscript('')
    if (!Recognition || !window.isSecureContext) return
    try {
      const recognition = new Recognition()
      active.current = recognition
      let final: string[] = []
      recognition.lang = 'id-ID'
      recognition.continuous = false
      recognition.interimResults = true
      recognition.maxAlternatives = 4
      recognition.onstart = () => {
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(finish, 16000)
        setPhase('listening')
      }
      recognition.onresult = ({ results, resultIndex }) => {
        const result = results[resultIndex]
        const phrase = result?.[0]?.transcript.trim()
        if (!phrase || final.length) return
        setTranscript(phrase)
        if (result.isFinal) {
          final = Array.from(result, ({ transcript }) => transcript.trim()).filter(Boolean)
          finish()
        }
      }
      recognition.onerror = ({ error }) => {
        if (final.length) return
        abort()
        setPhase('idle')
        setError(messages[error] ?? 'Pengenalan suara terhenti. Coba lagi atau ketik nama barang.')
      }
      recognition.onend = () => {
        release()
        setPhase('idle')
        if (final.length) phraseHandler.current(final[0], final)
        else setError(messages['no-speech'])
      }
      setPhase('requesting')
      timer.current = window.setTimeout(() => {
        abort()
        setPhase('idle')
        setError('Izin mikrofon belum diperoleh. Coba lagi atau ketik nama barang.')
      }, 30000)
      recognition.start()
    } catch {
      abort()
      setPhase('idle')
      setError('Mikrofon gagal dibuka. Anda bisa mencari dengan mengetik.')
    }
  }

  return { phase, transcript, error, start, finish, cancel, supported: Boolean(recognitionClass() && window.isSecureContext) }
}
