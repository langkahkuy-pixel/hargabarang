import { createClient } from '@supabase/supabase-js'
import { CatalogError, type Catalog, type Member, type PriceChange, type Product, type Role } from './catalog'
import { isPublicSupabaseKey } from './public-config'

type Profile = { user_id: string; store_id: string; role: Role }
type Store = { id: string; name: string; created_at: string }
type Cost = { product_id: string; store_id: string; cost_price: number }
type SaveArgs = {
  p_id: string | null; p_store_id: string; p_name: string; p_brand: string; p_variant: string; p_unit: string
  p_sku: string | null; p_aliases: string[]; p_sale_price: number; p_stock_qty: number | null
  p_is_active: boolean; p_cost_price: number | null; p_expected_sale_price: number | null
}
type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] }
type Database = {
  public: {
    Tables: {
      profiles: Table<Profile>; stores: Table<Store>; products: Table<Product>
      product_costs: Table<Cost>; price_history: Table<PriceChange>
    }
    Views: Record<never, never>
    Functions: { save_product: { Args: SaveArgs; Returns: string } }
  }
}

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

function makeClient() {
  if (!url || !key || !isPublicSupabaseKey(key)) return null
  try {
    return createClient<Database>(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      global: { fetch: (input, options) => fetch(input, { ...options, cache: 'no-store' }) },
    })
  } catch {
    return null
  }
}

export const supabase = makeClient()
export const canDemo = import.meta.env.DEV && !url && !key

function requireClient() {
  if (!supabase) throw new CatalogError('Konfigurasi Supabase belum lengkap atau kunci publik tidak valid.')
  return supabase
}

type Response<T> = { data: T | null; error: { message: string; code: string } | null }
function unpack<T>(response: Response<T>): T | null {
  const { data, error } = response
  if (error) {
    if (error.code === '23505') throw new CatalogError('SKU sudah dipakai produk lain.', error.code)
    if (error.code === '40001') throw new CatalogError('Produk atau harga telah berubah. Muat ulang data sebelum menyimpan.', error.code)
    if (error.code === '42501') throw new CatalogError('Akun ini tidak memiliki izin untuk tindakan tersebut.', error.code)
    throw new CatalogError('Data toko gagal diproses. Coba lagi dalam beberapa saat.', error.code)
  }
  return data
}

async function allPages<T>(load: (start: number, end: number) => PromiseLike<Response<T[]>>) {
  const pageSize = 250
  const rows: T[] = []
  for (let offset = 0; ; offset += pageSize) {
    const page = unpack(await load(offset, offset + pageSize - 1)) ?? []
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

export async function loadMember(userId: string, email: string, signal: AbortSignal): Promise<Member> {
  const client = requireClient()
  const profileResult = await client.from('profiles').select('*').eq('user_id', userId).abortSignal(signal).maybeSingle()
  const profile = unpack(profileResult)
  if (!profile) throw new CatalogError('Akun ini belum terhubung ke toko. Hubungi pengelola toko untuk meminta akses.')
  const storeResult = await client.from('stores').select('name').eq('id', profile.store_id).abortSignal(signal).single()
  const store = unpack(storeResult)
  if (!store) throw new CatalogError('Toko tidak tersedia untuk akun ini.')
  return { userId, email, storeId: profile.store_id, storeName: store.name, role: profile.role }
}

export function storeCatalog(member: Member): Catalog {
  const client = requireClient()
  return {
    list(activeOnly, signal) {
      const query = client.from('products').select('*').eq('store_id', member.storeId)
      if (activeOnly) query.eq('is_active', true)
      return allPages((start, end) => query.order('id').range(start, end).abortSignal(signal))
    },
    async getActive(id, signal) {
      return unpack(await client.from('products').select('*').eq('store_id', member.storeId)
        .eq('id', id).eq('is_active', true).abortSignal(signal).maybeSingle())
    },
    history(productId, since, signal) {
      const query = client.from('price_history').select('*').eq('store_id', member.storeId)
      if (productId) query.eq('product_id', productId)
      if (since) query.gte('changed_at', since)
      return allPages((start, end) => query.order('changed_at', { ascending: false }).order('id').range(start, end).abortSignal(signal))
    },
    async costs(signal) {
      const rows = await allPages((start, end) => client.from('product_costs').select('product_id,cost_price')
        .eq('store_id', member.storeId).order('product_id').range(start, end).abortSignal(signal))
      return new Map(rows.map(({ product_id, cost_price }) => [product_id, cost_price]))
    },
    async save(draft, original) {
      unpack(await client.rpc('save_product', {
        p_id: original?.id ?? null, p_store_id: member.storeId, p_name: draft.name, p_brand: draft.brand,
        p_variant: draft.variant, p_unit: draft.unit, p_sku: draft.sku, p_aliases: draft.aliases,
        p_sale_price: draft.sale_price, p_stock_qty: draft.stock_qty, p_is_active: draft.is_active,
        p_cost_price: draft.cost_price, p_expected_sale_price: original?.sale_price ?? null,
      }))
    },
  }
}
