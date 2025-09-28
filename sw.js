/* Service Worker for Book Shelf Explorer
 * Version: v7
 * Changes (v7):
 *  - Added precache for reader & gemini client scripts to improve first-load reliability
 *  - Added /pages/reader.html to shell precache (still network-first for navigations)
 *  - Explicit bypass for Gemini API (generativelanguage.googleapis.com) so responses are never cached
 *  - Prep for future integrity/manifest revisioning
 *  - Carryover: navigation preload, TTL API caching, image expiration & trim utilities
 */
const SW_VERSION = 'v7';

// Cache name helpers (allows selective purge)
const CACHE_NAMES = {
  shell: `bse-shell-${SW_VERSION}`,
  pages: `bse-pages-${SW_VERSION}`,
  assets: `bse-assets-${SW_VERSION}`,
  images: 'bse-img',           // shared to persist between versions
  api: 'bse-api-runtime'       // runtime API cache (TTL controlled)
};

// Expiration policy (ms)
const MAX_IMAGE_AGE = 1000 * 60 * 60 * 24 * 30;   // 30 days
const MAX_API_AGE   = 1000 * 60 * 60 * 6;          // 6 hours
const MAX_API_ENTRIES = 80;                        // basic cap
const MAX_IMAGE_ENTRIES = 120;                     // basic cap

// Precache list (HTML partials removed to prevent staleness; they'll be network-first)
// You can add hashes in future for finer-grained invalidation
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/pages/admin.html',
  '/pages/reader.html',
  '/pages/my_library.html',
  '/pages/login_register.html',
  '/book.css',
  '/assets/css/components.css',
  '/assets/css/main.css',
  '/assets/css/responsive.css',
  '/assets/css/google-books.css',
  '/assets/js/main.js',
  '/assets/js/login.js',
  '/assets/js/google-books.js',
  '/assets/js/search.js',
  '/assets/js/library.js',
  '/assets/js/layout.js',
  '/assets/js/geminiClient.js',
  '/assets/js/reader.js',
  '/manifest.json',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
];

// A minimal offline fallback page (inline) - used if navigation fails
function offlineFallbackResponse() {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>Offline - Book Shelf Explorer</title><meta name="viewport" content="width=device-width,initial-scale=1"/><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;padding:2rem;background:#121212;color:#f5f5f5;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}h1{font-size:1.8rem;margin-bottom:0.5rem}p{max-width:600px;line-height:1.5}a{color:#4dabf7;text-decoration:none;font-weight:600;margin-top:1rem;display:inline-block}a:hover{text-decoration:underline}</style></head><body><h1>You're Offline</h1><p>The requested page isn't cached yet. Core features like your personal library will still load once this page is revisited online. Uploaded files remain stored locally.</p><a href="/index.html">Return to Home</a></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// Utility: network-first with timeout
async function networkFirst(req, cacheName, timeoutMs = 4500) {
  const cache = await caches.open(cacheName);
  try {
    const ctrl = new AbortController();
    const to = setTimeout(()=> ctrl.abort(), timeoutMs);
    const resp = await fetch(req, {signal: ctrl.signal});
    clearTimeout(to);
    if(resp && resp.ok) cache.put(req, resp.clone());
    return resp;
  } catch(err){
    const cached = await cache.match(req);
    if(cached) return cached;
    throw err;
  }
}

// Utility: stale-while-revalidate
async function staleWhileRevalidate(req, cacheName){
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then(resp=>{ if(resp && resp.ok) cache.put(req, resp.clone()); return resp; }).catch(()=> null);
  return cached || fetchPromise || fetchPromise.then(r=> r || cached);
}

// Utility: cache-first with expiration for images
async function imageCache(req){
  const cache = await caches.open(CACHE_NAMES.images);
  const cached = await cache.match(req);
  if(cached){
    const dateHeader = cached.headers.get('sw-cached-at');
    if(dateHeader){
      const age = Date.now() - parseInt(dateHeader,10);
      if(age > MAX_IMAGE_AGE){ await cache.delete(req); return fetchAndStoreImage(req, cache); }
    }
    return cached;
  }
  const stored = await fetchAndStoreImage(req, cache);
  trimCache(CACHE_NAMES.images, MAX_IMAGE_ENTRIES).catch(()=>{});
  return stored;
}
async function fetchAndStoreImage(req, cache){
  try {
    const resp = await fetch(req);
    if(resp.ok){
      // Clone and add a header by creating a new Response
      const headers = new Headers(resp.headers);
      headers.set('sw-cached-at', Date.now().toString());
      const body = await resp.clone().blob();
      const stored = new Response(body, {status:resp.status, statusText:resp.statusText, headers});
      cache.put(req, stored.clone());
      return stored;
    }
    return resp;
  } catch(err){
    const fallback = await cache.match(req);
    return fallback || Response.error();
  }
}

// API cache with TTL (network-first fallback to fresh cached)
async function apiNetworkFirstWithTTL(req){
  const cache = await caches.open(CACHE_NAMES.api);
  try {
    const resp = await fetch(req);
    if(resp && resp.ok){
      const headers = new Headers(resp.headers);
      headers.set('sw-fetched-at', Date.now().toString());
      const body = await resp.clone().blob();
      const stored = new Response(body, {status:resp.status, statusText:resp.statusText, headers});
      cache.put(req, stored.clone());
      // Trim after put
      trimCache(CACHE_NAMES.api, MAX_API_ENTRIES).catch(()=>{});
      return stored;
    }
    return resp;
  } catch(err){
    const cached = await cache.match(req);
    if(!cached) throw err;
    // verify TTL
    const ts = parseInt(cached.headers.get('sw-fetched-at')||'0',10);
    if(ts && (Date.now() - ts) < MAX_API_AGE) return cached;
    throw err;
  }
}

// Trim cache helper (FIFO heuristic)
async function trimCache(cacheName, maxEntries){
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if(keys.length <= maxEntries) return;
  const toDelete = keys.slice(0, keys.length - maxEntries);
  await Promise.all(toDelete.map(k=> cache.delete(k)));
}

self.addEventListener('install', evt => {
  evt.waitUntil((async ()=>{
    const cache = await caches.open(CACHE_NAMES.shell);
    await cache.addAll(PRECACHE_URLS);
    try { self.skipWaiting(); } catch {}
  })());
});

self.addEventListener('activate', evt => {
  evt.waitUntil((async ()=>{
    // Enable navigation preload if supported
    if(self.registration.navigationPreload){
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    const keys = await caches.keys();
    const valid = new Set(Object.values(CACHE_NAMES));
    await Promise.all(keys.filter(k => k.startsWith('bse-') && !valid.has(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', evt => {
  const req = evt.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);

  // HTML navigation: network-first with fallback + offline fallback
  if(req.mode === 'navigate'){
    evt.respondWith((async ()=>{
      try {
        // Use navigation preload if available for speed
        const preload = evt.preloadResponse ? await evt.preloadResponse : null;
        if(preload){
          const cache = await caches.open(CACHE_NAMES.pages);
          cache.put(req, preload.clone());
          return preload;
        }
        return await networkFirst(req, CACHE_NAMES.pages, 5000);
      } catch{
        const cached = await caches.match(req);
        return cached || offlineFallbackResponse();
      }
    })());
    return;
  }

  // Partials (header/footer) - force network-first to avoid stale UI, fallback to cache
  if(url.origin === location.origin && /\/assets\/partials\/(header|footer)\.html$/.test(url.pathname)){
    evt.respondWith((async ()=>{
      try { return await networkFirst(req, CACHE_NAMES.assets, 4000); } catch { return caches.match(req) || Response.error(); }
    })());
    return;
  }

  // CSS / JS: stale-while-revalidate
  if(url.origin === location.origin && /\.(css|js)$/.test(url.pathname)){
    evt.respondWith(staleWhileRevalidate(req, CACHE_NAMES.assets));
    return;
  }

  // Images: cache-first with basic expiration
  if(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(url.pathname)){
    evt.respondWith(imageCache(req));
    return;
  }

  // Gemini API: always network, never cache (avoid storing sensitive outputs)
  if(/generativelanguage\.googleapis\.com/.test(url.hostname)){
    evt.respondWith(fetch(req).catch(()=> new Response('Gemini API unreachable',{status:503}))); return; }

  // Google Books & other allowed googleapis calls: network-first with TTL fallback
  if(/googleapis\.com/.test(url.hostname)){
    evt.respondWith(apiNetworkFirstWithTTL(req));
    return;
  }

  // Default: try cache then network
  evt.respondWith(caches.match(req).then(c=> c || fetch(req).catch(()=> undefined)));
});

self.addEventListener('message', evt => {
  const data = evt.data;
  if(data === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if(data === 'PING') {
    evt.source && evt.source.postMessage({type:'PONG', version: SW_VERSION});
  } else if(data === 'GET_VERSION') {
    evt.source && evt.source.postMessage({type:'SW_VERSION', version: SW_VERSION});
  } else if(data && data.type === 'CLEAR_CACHES') {
    (async ()=>{
      const keep = new Set(Object.values(CACHE_NAMES));
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k.startsWith('bse-') && !keep.has(k)).map(k => caches.delete(k)));
      evt.source && evt.source.postMessage({type:'CLEAR_DONE'});
    })();
  }
});
