export function isPublicSupabaseKey(value: string) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true
  try {
    const payload = value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload)).role === 'anon'
  } catch {
    return false
  }
}
