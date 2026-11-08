import { randomBytes, randomInt, scryptSync } from 'node:crypto'

const pin = randomInt(10_000_000_000).toString().padStart(10, '0')
const salt = randomBytes(16)
const digest = scryptSync(pin, salt, 32)

console.log(`PIN admin (simpan secara pribadi) ${pin}`)
console.log(`ADMIN_PIN_HASH=scrypt:${salt.toString('hex')}:${digest.toString('hex')}`)
console.log(`ADMIN_SESSION_SECRET=${randomBytes(32).toString('hex')}`)
