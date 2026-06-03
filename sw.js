// DistriMax Service Worker v1.2
const CACHE_NAME = 'distrimax-v1.2';
const CACHE_STATIC = 'distrimax-static-v1.2';

// Recursos del app shell que se cachean siempre
const APP_SHELL = [
  './pagina_clientes_pedidos.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// Dominios que siempre van a la red (API calls)
const NETWORK_ONLY = [
  'supabase.co',
  'firebase',
  'firebaseio.com',
  'googleapis.com',
  'google.com/maps'
];

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', function(e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_STATIC).then(function(cache) {
      return cache.addAll(APP_SHELL.map(function(url) {
        return new Request(url, { cache: 'reload' });
      })).catch(function(err) {
        console.warn('[SW] Cache install partial:', err);
      });
    })
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) {
          return k !== CACHE_NAME && k !== CACHE_STATIC;
        }).map(function(k) {
          console.log('[SW] Borrando caché viejo:', k);
          return caches.delete(k);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── FETCH ─────────────────────────────────────────────────────
self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // API calls → siempre a la red, sin caché
  var isNetworkOnly = NETWORK_ONLY.some(function(domain) {
    return url.includes(domain);
  });
  if (isNetworkOnly || e.request.method !== 'GET') {
    return; // fetch normal sin interceptar
  }

  // App shell → cache-first con refresh en background
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      var fetchPromise = fetch(e.request).then(function(response) {
        if (response && response.status === 200 && response.type !== 'opaque') {
          var toCache = response.clone();
          caches.open(CACHE_STATIC).then(function(cache) {
            cache.put(e.request, toCache);
          });
        }
        return response;
      }).catch(function() {
        return cached; // offline fallback
      });

      return cached || fetchPromise;
    })
  );
});

// ── SYNC (para pedidos offline pendientes) ────────────────────
self.addEventListener('sync', function(e) {
  if (e.tag === 'sync-pedidos') {
    e.waitUntil(
      self.clients.matchAll().then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({ type: 'SYNC_PEDIDOS' });
        });
      })
    );
  }
});

// ── PUSH NOTIFICATIONS ────────────────────────────────────────
self.addEventListener('push', function(e) {
  if (!e.data) return;
  var data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title || 'DistriMax', {
      body:  data.body  || '',
      icon:  './icon-192.png',
      badge: './icon-72.png',
      vibrate: [200, 100, 200],
      data:  data.data  || {}
    })
  );
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(
    self.clients.openWindow('./pagina_clientes_pedidos.html')
  );
});
