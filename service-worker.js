const cacheName = 'asisten-harga-shell-__VERSION__'
const shell = __SHELL__
const staticPaths = new Set(shell)

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(shell)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(
    names.filter((name) => name.startsWith('asisten-harga-shell-') && name !== cacheName)
      .map((name) => caches.delete(name)),
  )).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return
  if (event.request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) {
    event.respondWith(fetch(event.request).catch(async () => (await caches.open(cacheName)).match('/index.html')))
  } else if (staticPaths.has(url.pathname)) {
    event.respondWith(caches.open(cacheName).then(async (cache) =>
      (await cache.match(url.pathname)) ?? fetch(event.request)))
  }
})
