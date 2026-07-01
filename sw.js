/* NRDS Tahiti — Service Worker
 * Offline-first: app shell + static data from cache, tiles cached as visited */

var CACHE = 'nrds-v1';
var TILE_CACHE = 'nrds-tiles-v1';
var BASE = new URL(self.location.href).pathname.replace('sw.js', '');

var PRECACHE = [
  BASE,
  BASE + 'index.html',
  BASE + 'sw.js',
  BASE + 'manifest.json',
  BASE + 'data/management_unit.json',
  BASE + 'data/derat_tahiti.json',
  BASE + 'data/espece.json',
];

/* Install: pre-cache app shell. Errors on individual URLs are swallowed
 * so the SW still installs even if one file 404s. */
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return Promise.allSettled(
        PRECACHE.map(function(url) {
          return fetch(url).then(function(resp) {
            if (resp && resp.ok) return cache.put(url, resp);
          }).catch(function() {});
        })
      );
    }).then(function() { return self.skipWaiting(); })
  );
});

/* Activate: delete old caches */
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE && k !== TILE_CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch(err) { return; }

  /* ── Map tiles: cache-first, populate on first view ── */
  if (
    url.hostname.includes('arcgisonline.com') ||
    url.hostname.includes('tile.openstreetmap.org')
  ) {
    e.respondWith(
      caches.open(TILE_CACHE).then(function(cache) {
        return cache.match(req).then(function(hit) {
          if (hit) return hit;
          return fetch(req).then(function(resp) {
            if (resp && resp.ok && resp.status === 200) {
              cache.put(req, resp.clone());
            }
            return resp;
          }).catch(function() {
            return new Response('', { status: 503, statusText: 'Offline' });
          });
        });
      })
    );
    return;
  }

  /* ── Supabase API: pass through (app handles localStorage fallback) ── */
  if (url.hostname.includes('supabase.co')) return;

  /* ── esm.sh (Supabase client): network-first, cache on success ── */
  if (url.hostname === 'esm.sh' || url.href.includes('esm.sh')) {
    e.respondWith(
      fetch(req).then(function(resp) {
        if (resp && resp.ok) {
          caches.open(CACHE).then(function(c) { c.put(req, resp.clone()); });
        }
        return resp;
      }).catch(function() {
        return caches.match(req).then(function(hit) {
          return hit || new Response('', { status: 503 });
        });
      })
    );
    return;
  }

  /* ── App shell & static data: cache-first, update in background ── */
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then(function(hit) {
        var networkFetch = fetch(req).then(function(resp) {
          if (resp && resp.ok) {
            caches.open(CACHE).then(function(c) { c.put(req, resp.clone()); });
          }
          return resp;
        }).catch(function() { return hit; });
        return hit || networkFetch;
      })
    );
    return;
  }
});
