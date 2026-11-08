import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { localStoreApi } from './server/vite-api'

export default defineConfig({
  envPrefix: [],
  plugins: [
    react(),
    localStoreApi(),
    {
      name: 'build-pwa-shell',
      apply: 'build',
      async writeBundle(options) {
        const directory = resolve(options.dir ?? 'dist')
        const files = (await readdir(directory, { recursive: true }))
          .map((path) => path.replaceAll('\\', '/'))
          .filter((path) => /^assets\/.+\.[a-z0-9]+$/i.test(path) || /^(index\.html|manifest\.webmanifest|icon.*\.(png|svg))$/.test(path))
          .sort()
        const template = await readFile(new URL('./service-worker.js', import.meta.url), 'utf8')
        const hash = createHash('sha256').update(template)
        for (const path of files) hash.update(await readFile(resolve(directory, path)))
        const version = hash.digest('hex').slice(0, 16)
        const script = template.replace('__VERSION__', version).replace('__SHELL__', JSON.stringify(files.map((path) => `/${path}`)))
        await writeFile(resolve(directory, 'sw.js'), script)
      },
    },
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
})
