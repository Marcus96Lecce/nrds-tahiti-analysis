/* NRDS Tahiti — Service Worker v3
 * Intercepts only: same-origin app shell + map tiles.
 * Does NOT touch esm.sh, supabase.co, or any other cross-origin request
 * (intercepting esm.sh ES-module imports breaks Supabase on mobile). */

var CACHE = 'nrds-v3';
var TILE_CACHE = 'nrds-tiles-v1';
var BASE = new URL(self.location.href).pathname.replace('sw.js', '');

var PRECACHE = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'data/management_unit.json',
  BASE + 'data/derat_tahiti.json',
  BASE + 'data/espece.json',
  BASE + 'data/bird_species.json',
];

/* Install: pre-cache app shell. Each URL cached independently so one
 * 404 doesn't abort the whole install. */
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      var fetches = PRECACHE.map(function(url) {
        return cache.add(url).catch(function() {});
      });
      return Promise.all(fetches);
    }).then(function() { return self.skipWaiting(); })
  );
});

/* Activate: delete old caches, claim all clients immediately. */
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(k) { return k !== CACHE && k !== TILE_CACHE; })
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

  /* ── Map tiles: cache-first, populate on first view ──
   * Only images — safe to cache as opaque responses. */
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
            return new Response('', { status: 503, statusText: 'Tile offline' });
          });
        });
      })
    );
    return;
  }

  /* ── App shell (the page itself): network-first ──
   * This is the file that actually changes on every deploy — cache-first here meant a
   * fix could sit deployed on GitHub Pages for days while every phone kept serving the
   * cached-before-the-fix version (each reload silently re-cached the newer copy in the
   * background, but only *displayed* it one reload later — always one version behind).
   * Try the network first so an online reload always gets the latest app code; only fall
   * back to the last-known-good cached copy when there's truly no connection (in the
   * valleys). */
  var isAppShell = req.mode === 'navigate' || url.pathname === BASE || url.pathname === BASE + 'index.html';
  if (url.origin === self.location.origin && isAppShell) {
    e.respondWith(
      fetch(req).then(function(resp) {
        if (resp && resp.ok) caches.open(CACHE).then(function(c) { c.put(req, resp.clone()); });
        return resp;
      }).catch(function() {
        return caches.match(req).then(function(hit) { return hit || new Response('App offline', { status: 503 }); });
      })
    );
    return;
  }

  /* ── Everything else same-origin: static JSON reference data, manifest, icons — cache-first ──
   * These only change when Marco reruns the migration script, not on every code deploy, so
   * cache-first (instant, works offline) is still the right tradeoff for them.
   * On miss: fetch from network and add to cache.
   * On network error with cache hit: return stale cache. */
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then(function(hit) {
        var networkFetch = fetch(req).then(function(resp) {
          if (resp && resp.ok) {
            caches.open(CACHE).then(function(c) { c.put(req, resp.clone()); });
          }
          return resp;
        }).catch(function() {
          return hit || new Response('App offline', { status: 503 });
        });
        return hit || networkFetch;
      })
    );
    return;
  }

  /* Everything else (esm.sh, supabase.co, analytics, …) — do NOT intercept.
   * Returning without calling e.respondWith() lets the browser handle normally. */
});
