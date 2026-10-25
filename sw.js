const CACHE = 'geotag-photo-v6';
const FILES = ['/', '/index.html', '/exif.js', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(FILES.map(async path => {
      try {
        const res = await fetch(path, { cache: 'reload' });
        if (res && res.ok && !res.redirected) await cache.put(path, res.clone());
      } catch (err) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  // Never substitute the page HTML for the manifest or icons.
  // Chrome refuses the install dialog when those files are not the real bytes.
  const isAppMeta = url.pathname === '/manifest.json' || url.pathname === '/icon-192.png' || url.pathname === '/icon-512.png';
  if (isAppMeta) {
    event.respondWith(
      fetch(req).then(res => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req).then(hit => hit || Response.error()))
    );
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic' && !res.redirected) {
        await cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      if (req.mode === 'navigate') {
        return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error();
      }
      throw err;
    }
  })());
});
