import { useCallback, useEffect, useRef, useState } from 'react'

type Playback = {
  id: number
  timer?: number
  utterance?: SpeechSynthesisUtterance
  source?: AudioBufferSourceNode
}
type AudioReply = { id: number; pcm?: Float32Array<ArrayBuffer>; sampleRate?: number }

const failed = 'Suara gagal diputar. Ketuk Bacakan harga untuk mencoba lagi.'
const isIndonesian = (voice: SpeechSynthesisVoice) => /^(?:id|in)(?:[-_]|$)/i.test(voice.lang)

export function useSpeech() {
  const synthesis = window.speechSynthesis
  const localSupported = Boolean(window.AudioContext && window.Worker && window.WebAssembly && window.DecompressionStream)
  const [nativeAvailable, setNativeAvailable] = useState(() => Boolean(synthesis?.getVoices().some(isIndonesian)))
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'playing'>('idle')
  const [error, setError] = useState('')
  const active = useRef<Playback | null>(null)
  const sequence = useRef(0)
  const audio = useRef<AudioContext | null>(null)
  const worker = useRef<Worker | null>(null)

  const clearPlayback = useCallback(() => {
    const playback = active.current
    if (!playback) return
    active.current = null
    window.clearTimeout(playback.timer)
    if (playback.utterance) synthesis?.cancel()
    if (playback.source) playback.source.stop()
  }, [synthesis])

  const stop = useCallback(() => {
    clearPlayback()
    setPhase('idle')
    setError('')
  }, [clearPlayback])

  const finish = useCallback((playback: Playback, message = '') => {
    if (active.current !== playback) return
    window.clearTimeout(playback.timer)
    active.current = null
    setPhase('idle')
    setError(message)
  }, [])

  const prepare = useCallback(() => {
    if (!localSupported) return
    try {
      const context = audio.current ??= new AudioContext()
      if (context.state !== 'running') void context.resume().catch(() => {})
    } catch { /* A device may still support its native speech engine. */ }
  }, [localSupported])

  useEffect(() => {
    const update = () => setNativeAvailable(Boolean(synthesis?.getVoices().some(isIndonesian)))
    synthesis?.addEventListener('voiceschanged', update)
    update()
    return () => {
      synthesis?.removeEventListener('voiceschanged', update)
      clearPlayback()
      worker.current?.terminate()
      worker.current = null
      void audio.current?.close().catch(() => {})
      audio.current = null
    }
  }, [clearPlayback, synthesis])

  const speak = useCallback((text: string) => {
    stop()
    const playback: Playback = { id: ++sequence.current }
    active.current = playback
    setPhase('preparing')

    function local() {
      if (active.current !== playback) return
      window.clearTimeout(playback.timer)
      if (playback.utterance) {
        playback.utterance.onstart = playback.utterance.onend = playback.utterance.onerror = null
        playback.utterance = undefined
        synthesis?.cancel()
      }
      prepare()
      const context = audio.current
      if (!context) {
        finish(playback, failed)
        return
      }
      try {
        const renderer = worker.current ??= new Worker(new URL('./indonesian-speech.worker.ts', import.meta.url), { type: 'module' })
        renderer.onerror = () => {
          renderer.terminate()
          if (worker.current === renderer) worker.current = null
          finish(playback, failed)
        }
        renderer.onmessage = async ({ data }: MessageEvent<AudioReply>) => {
          if (active.current !== playback || data.id !== playback.id) return
          try {
            if (!data.pcm?.length || !data.sampleRate) throw new Error('No speech samples')
            if (context.state !== 'running') await context.resume()
            if (active.current !== playback) return
            const buffer = context.createBuffer(1, data.pcm.length, data.sampleRate)
            buffer.copyToChannel(data.pcm, 0)
            const source = context.createBufferSource()
            source.buffer = buffer
            source.connect(context.destination)
            source.onended = () => {
              source.disconnect()
              finish(playback)
            }
            source.start()
            playback.source = source
            window.clearTimeout(playback.timer)
            setPhase('playing')
          } catch {
            finish(playback, failed)
          }
        }
        playback.timer = window.setTimeout(() => finish(playback, failed), 10000)
        renderer.postMessage({ id: playback.id, text })
      } catch {
        finish(playback, failed)
      }
    }

    const voices = synthesis?.getVoices().filter(isIndonesian) ?? []
    const voice = voices.find((entry) => entry.localService) ?? voices[0]
    if (!voice || !synthesis || !window.SpeechSynthesisUtterance) {
      local()
      return
    }
    try {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.voice = voice
      utterance.lang = 'id-ID'
      utterance.rate = 0.9
      utterance.onstart = () => {
        if (active.current !== playback) return
        window.clearTimeout(playback.timer)
        setPhase('playing')
      }
      utterance.onend = () => finish(playback)
      utterance.onerror = local
      playback.utterance = utterance
      if (localSupported) playback.timer = window.setTimeout(local, 1800)
      synthesis.speak(utterance)
    } catch {
      local()
    }
  }, [finish, localSupported, prepare, stop, synthesis])

  return {
    available: localSupported || (nativeAvailable && Boolean(window.SpeechSynthesisUtterance)),
    speaking: phase !== 'idle', playing: phase === 'playing', error, prepare, speak, stop,
  }
}
