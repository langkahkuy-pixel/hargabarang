// SPDX-License-Identifier: GPL-3.0-or-later
// Standalone text-in, PCM-out adapter for Spellophone/eSpeak NG.
import { createEspeak, toFloat32 } from '@spelling-creator/spellophone/browser'
import wasmUrl from '@spelling-creator/spellophone/wasm/espeak-ng.wasm?url'
import manifestUrl from '@spelling-creator/spellophone/espeak-ng-data/manifest.json?url'
import coreUrl from '@spelling-creator/spellophone/espeak-ng-data/core.bin.gz?url'
import englishUrl from '@spelling-creator/spellophone/espeak-ng-data/en_dict.gz?url'
import indonesianUrl from '@spelling-creator/spellophone/espeak-ng-data/id_dict.gz?url'

const files = new Map([
  ['manifest.json', manifestUrl], ['core.bin.gz', coreUrl],
  ['en_dict.gz', englishUrl], ['id_dict.gz', indonesianUrl],
])
let engine: ReturnType<typeof createEspeak> | undefined

function indonesianVoice() {
  return engine ??= createEspeak({
    wasmUrl,
    dataUrl: new URL('./speech-data/', self.location.href),
    languages: ['id'],
    fetch: (input, options) => {
      const url = input instanceof Request ? input.url : String(input)
      const asset = files.get(new URL(url).pathname.split('/').at(-1) ?? '')
      if (!asset) return Promise.reject(new Error('Unrecognized speech asset'))
      return fetch(asset, options)
    },
  }).then((voice) => {
    voice.setVoice('id')
    return voice
  }).catch((error: unknown) => {
    engine = undefined
    throw error
  })
}

self.onmessage = async ({ data }: MessageEvent<{ id: number; text: string }>) => {
  try {
    const voice = await indonesianVoice()
    const { samples, sampleRate } = voice.synthesize(data.text)
    const pcm = toFloat32(samples)
    self.postMessage({ id: data.id, pcm, sampleRate }, { transfer: [pcm.buffer] })
  } catch {
    self.postMessage({ id: data.id })
  }
}
