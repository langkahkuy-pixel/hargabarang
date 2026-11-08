import { randomUUID } from 'node:crypto'
import mariadb, { type Pool, type UpsertResult } from 'mariadb'
import { startOfStoreDay, type Category, type DashboardData, type PriceChange, type Product, type ProductDraft } from '../shared/store.js'
import { ApiError } from './errors.js'

export interface StoreRepository {
  dashboard(adminUntil: number | null): Promise<DashboardData>
  searchCatalog(): Promise<Product[]>
  activeProduct(id: string): Promise<Product | null>
  history(productId: string | null): Promise<PriceChange[]>
  saveProduct(draft: ProductDraft, original: { id: string; revision: number } | null): Promise<string>
  deleteProduct(id: string, revision: number): Promise<void>
  saveCategory(name: string, id: string | null): Promise<string>
  deleteCategory(id: string): Promise<void>
  reservePinAttempt(): Promise<boolean>
}

type ProductRow = Omit<Product, 'aliases' | 'sale_price' | 'stock_qty' | 'is_active'> & {
  aliases: unknown
  sale_price: string
  stock_qty: string | null
  is_active: number
  cost_price?: string | null
}
type PriceRow = Omit<PriceChange, 'old_price' | 'new_price'> & { old_price: string; new_price: string }
const productColumns = 'id, category_id, name, brand, variant, unit, sku, aliases, sale_price, is_active, revision, created_at, updated_at'
const publicColumns = `${productColumns}, NULL AS stock_qty`
const activeFilter = 'deleted_at IS NULL AND is_active = 1'
const productOrder = 'ORDER BY name, brand, variant, id'

function iso(utc: string) {
  return new Date(utc.replace(' ', 'T') + 'Z').toISOString()
}

function normalizeProduct({ aliases, sale_price, stock_qty, is_active, created_at, updated_at, cost_price: _cost, ...publicFields }: ProductRow): Product {
  const parsed: unknown = typeof aliases === 'string' ? JSON.parse(aliases) : aliases
  return {
    ...publicFields,
    aliases: Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [],
    sale_price: Number(sale_price),
    stock_qty: stock_qty === null ? null : Number(stock_qty),
    is_active: Boolean(is_active),
    created_at: iso(created_at),
    updated_at: iso(updated_at),
  }
}

function checkRevision(result: UpsertResult) {
  if (!result.affectedRows) {
    throw new ApiError(409, 'PRODUCT_CHANGED', 'Produk telah berubah atau dihapus. Muat ulang katalog sebelum mencoba lagi.')
  }
}

export function createRepository(pool: Pool): StoreRepository {
  return {
    async dashboard(adminUntil) {
      const productsSql = adminUntil
        ? `SELECT ${productColumns}, stock_qty, cost_price FROM products WHERE deleted_at IS NULL ${productOrder}`
        : `SELECT ${publicColumns} FROM products WHERE ${activeFilter} ${productOrder}`
      const [rows, categories, counts] = await Promise.all([
        pool.query<ProductRow[]>(productsSql),
        pool.query<Category[]>('SELECT id, name FROM categories ORDER BY name'),
        pool.query<{ total: bigint }[]>('SELECT COUNT(DISTINCT product_id) AS total FROM price_history WHERE changed_at >= ?', [
          startOfStoreDay().slice(0, -1).replace('T', ' '),
        ]),
      ])
      const summary: DashboardData = { products: rows.map(normalizeProduct), categories, changedToday: Number(counts[0].total), adminUntil }
      if (adminUntil) summary.costs = Object.fromEntries(rows.flatMap((row) =>
        row.cost_price == null ? [] : [[row.id, Number(row.cost_price)]],
      ))
      return summary
    },
    async searchCatalog() {
      const rows = await pool.query<ProductRow[]>(`SELECT ${publicColumns} FROM products WHERE ${activeFilter} ${productOrder}`)
      return rows.map(normalizeProduct)
    },
    async activeProduct(id) {
      const rows = await pool.query<ProductRow[]>(`SELECT ${publicColumns} FROM products WHERE ${activeFilter} AND id = ?`, [id])
      return rows[0] ? normalizeProduct(rows[0]) : null
    },
    async history(productId) {
      const rows = await pool.query<PriceRow[]>(
        `SELECT id, product_id, product_label, old_price, new_price, changed_at
         FROM price_history ${productId ? 'WHERE product_id = ?' : ''} ORDER BY changed_at DESC, id DESC`,
        productId ? [productId] : [],
      )
      return rows.map((row) => ({ ...row, old_price: Number(row.old_price), new_price: Number(row.new_price), changed_at: iso(row.changed_at) }))
    },
    async saveProduct(draft, original) {
      const productId = original?.id ?? randomUUID()
      const fields = [
        draft.category_id, draft.name, draft.brand, draft.variant, draft.unit, draft.sku, JSON.stringify(draft.aliases),
        draft.sale_price.toFixed(2), draft.cost_price?.toFixed(2) ?? null, draft.stock_qty?.toFixed(2) ?? null, draft.is_active,
      ]
      if (original) {
        checkRevision(await pool.query<UpsertResult>(
          `UPDATE products SET category_id = ?, name = ?, brand = ?, variant = ?, unit = ?, sku = ?, aliases = ?,
            sale_price = ?, cost_price = ?, stock_qty = ?, is_active = ?
           WHERE id = ? AND revision = ? AND deleted_at IS NULL`,
          [...fields, productId, original.revision],
        ))
      } else {
        await pool.query(
          `INSERT INTO products (id, category_id, name, brand, variant, unit, sku, aliases, sale_price, cost_price, stock_qty, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [productId, ...fields],
        )
      }
      return productId
    },
    async deleteProduct(id, revision) {
      checkRevision(await pool.query<UpsertResult>(
        'UPDATE products SET deleted_at = UTC_TIMESTAMP(3), is_active = 0 WHERE id = ? AND revision = ? AND deleted_at IS NULL',
        [id, revision],
      ))
    },
    async saveCategory(name, id) {
      if (id) {
        const result = await pool.query<UpsertResult>('UPDATE categories SET name = ? WHERE id = ?', [name, id])
        if (!result.affectedRows) throw new ApiError(404, 'CATEGORY_MISSING', 'Kategori tidak ditemukan.')
        return id
      }
      const newId = randomUUID()
      await pool.query('INSERT INTO categories (id, name) VALUES (?, ?)', [newId, name])
      return newId
    },
    async deleteCategory(id) {
      const result = await pool.query<UpsertResult>('DELETE FROM categories WHERE id = ?', [id])
      if (!result.affectedRows) throw new ApiError(404, 'CATEGORY_MISSING', 'Kategori tidak ditemukan.')
    },
    async reservePinAttempt() {
      const result = await pool.query<UpsertResult>(
        `UPDATE admin_pin_attempts
         SET attempts = IF(window_ends_at <= UTC_TIMESTAMP(3), 1, attempts + 1),
             window_ends_at = IF(window_ends_at <= UTC_TIMESTAMP(3), UTC_TIMESTAMP(3) + INTERVAL 5 MINUTE, window_ends_at)
         WHERE id = 1 AND (window_ends_at <= UTC_TIMESTAMP(3) OR attempts < 10)`,
      )
      return result.affectedRows === 1
    },
  }
}

export function createStorePool(env: NodeJS.ProcessEnv) {
  const { MARIADB_HOST: host, MARIADB_USER: user, MARIADB_PASSWORD: password, MARIADB_DATABASE: database } = env
  const port = Number(env.MARIADB_PORT || 3306)
  const tls = env.MARIADB_TLS !== 'false'
  const local = host && ['localhost', '127.0.0.1', '::1'].includes(host)
  if (!host || !user || !password || !database || !Number.isInteger(port) || port < 1 || port > 65535
      || (!tls && (env.VERCEL === '1' || !local))) {
    throw new ApiError(503, 'DATABASE_CONFIG', 'Koneksi database toko belum dikonfigurasi.')
  }
  return mariadb.createPool({
    host, port, user, password, database,
    ssl: tls ? { rejectUnauthorized: true, ca: env.MARIADB_CA_PEM?.replaceAll('\\n', '\n') } : false,
    connectionLimit: 3, connectTimeout: 5000, acquireTimeout: 5500, queryTimeout: 4500,
    idleTimeout: 45, dateStrings: true,
  })
}
