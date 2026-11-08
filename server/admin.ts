import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { ApiError } from './errors.js'

const derive = promisify(scrypt)
const ttlSeconds = 30 * 60
const pinHashPattern = /^scrypt:([0-9a-f]{32}):([0-9a-f]{64})$/
const configuredSecret = /^[0-9a-f]{64}$/

export async function hashPin(pin: string) {
  const salt = randomBytes(16)
  const digest = await derive(pin, salt, 32) as Buffer
  return `scrypt:${salt.toString('hex')}:${digest.toString('hex')}`
}

export function adminAccess(env: NodeJS.ProcessEnv, now = Date.now) {
  const pinHash = env.ADMIN_PIN_HASH?.trim()
  const parsed = pinHash?.match(pinHashPattern)
  const secret = env.ADMIN_SESSION_SECRET?.trim()
  const key = secret && configuredSecret.test(secret) ? Buffer.from(secret, 'hex') : null
  const secure = (request: Request) => env.VERCEL === '1' || new URL(request.url).protocol === 'https:'
  const cookieName = (request: Request) => secure(request) ? '__Host-store_admin' : 'store_admin'

  const cookie = (request: Request, value: string, maxAge: number) =>
    `${cookieName(request)}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure(request) ? '; Secure' : ''}`

  const sign = (payload: string) => createHmac('sha256', key!).update(`${pinHash}:${payload}`).digest('hex')

  return {
    requireConfig() {
      if (!parsed || !key) throw new ApiError(503, 'PIN_CONFIG', 'Akses admin belum dikonfigurasi.')
    },
    async verifyPin(pin: string) {
      if (!parsed) return false
      const digest = await derive(pin, Buffer.from(parsed[1], 'hex'), 32) as Buffer
      return timingSafeEqual(digest, Buffer.from(parsed[2], 'hex'))
    },
    unlock(request: Request) {
      const until = now() + ttlSeconds * 1000
      const payload = `${until}.${randomBytes(16).toString('hex')}`
      return { until, cookie: cookie(request, `${payload}.${sign(payload)}`, ttlSeconds) }
    },
    lock(request: Request) {
      return cookie(request, '', 0)
    },
    until(request: Request) {
      if (!parsed || !key) return null
      const prefix = `${cookieName(request)}=`
      const token = request.headers.get('cookie')?.split(';').map((entry) => entry.trim())
        .find((entry) => entry.startsWith(prefix))?.slice(prefix.length)
      const parts = token?.match(/^(\d{1,16})\.([0-9a-f]{32})\.([0-9a-f]{64})$/)
      if (!parts) return null
      const until = Number(parts[1])
      if (!Number.isSafeInteger(until) || until <= now()) return null
      return timingSafeEqual(Buffer.from(parts[3], 'hex'), Buffer.from(sign(`${parts[1]}.${parts[2]}`), 'hex')) ? until : null
    },
  }
}
