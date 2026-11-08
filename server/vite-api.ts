import { TLSSocket } from 'node:tls'
import { Readable } from 'node:stream'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseEnv } from 'node:util'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import { configuredStoreApi } from './api.js'

export function localStoreApi(): Plugin {
  function setup(server: ViteDevServer | PreviewServer) {
    const local = resolve(server.config.envDir || server.config.root, '.env.local')
    const env = existsSync(local) ? parseEnv(readFileSync(local, 'utf8')) : {}
    const api = configuredStoreApi({ ...env, ...process.env })
    server.middlewares.use((req, res, next) => {
      if (req.url?.split('?')[0] !== '/api/store') return next()
      void (async () => {
        const headers = new Headers()
        for (const [name, value] of Object.entries(req.headers)) {
          if (typeof value === 'string') headers.set(name, value)
          else for (const item of value ?? []) headers.append(name, item)
        }
        const method = req.method ?? 'GET'
        const protocol = req.socket instanceof TLSSocket && req.socket.encrypted ? 'https' : 'http'
        const options: RequestInit & { duplex?: 'half' } = { method, headers }
        if (!['GET', 'HEAD'].includes(method)) {
          options.body = Readable.toWeb(req) as ReadableStream
          options.duplex = 'half'
        }
        const response = await api(new Request(`${protocol}://${req.headers.host}${req.url}`, options))
        res.writeHead(response.status, Object.fromEntries(response.headers))
        res.end(Buffer.from(await response.arrayBuffer()))
      })().catch(() => {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify({ code: 'API_ERROR', message: 'Layanan toko gagal merespons.' }))
      })
    })
  }
  return { name: 'local-store-api', configureServer: setup, configurePreviewServer: setup }
}
