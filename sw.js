// DISTRIBIX Service Worker v1.12
const CACHE_NAME = 'distribix-v1.12';
const CACHE_STATIC = 'distribix-static-v1.12';

// Se conservan los nombres usados en GitHub. PANEL-index_15.html permite probar
// directamente el archivo de desarrollo; si no existe en producción no bloquea
// la instalación del resto del app shell.
const PANEL_CANDIDATES = [
  './',
  './pagina_clientes_pedidos.html',
  './PANEL-index_15.html'
];

const APP_SHELL = PANEL_CANDIDATES.concat([
  './manifest.json',
  './distribix-logo-completo.png',
  './icon-192.png',
  './icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
]);

// Dominios de datos: nunca se cachean en el Service Worker. Reparto y Hoja de
// Ruta administran su propia caché y cola persistente dentro del panel.
const NETWORK_ONLY = [
  'supabase.co',
  'firebase',
  'firebaseio.com',
  'googleapis.com',
  'google.com/maps'
];

self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_STATIC).then(function(cache) {
      return Promise.allSettled(APP_SHELL.map(function(url) {
        return cache.add(new Request(url, { cache: 'reload' }));
      }));
    })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          return key !== CACHE_NAME && key !== CACHE_STATIC;
        }).map(function(key) {
          return caches.delete(key);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(event) {
  var request = event.request;
  var url = request.url;
  var isNetworkOnly = NETWORK_ONLY.some(function(domain) {
    return url.includes(domain);
  });

  if (isNetworkOnly || request.method !== 'GET') return;

  // Navegación: busca primero la versión nueva y usa la copia local si no hay
  // señal. Así una actualización desplegada no queda escondida por un HTML viejo.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(function(response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(CACHE_STATIC).then(function(cache) {
            cache.put(request, copy);
          });
        }
        return response;
      }).catch(function() {
        return caches.match(request).then(function(cached) {
          if (cached) return cached;
          return _primerPanelCacheado();
        });
      })
    );
    return;
  }

  // Recursos estáticos: cache-first y actualización silenciosa.
  event.respondWith(
    caches.match(request).then(function(cached) {
      var refresh = fetch(request).then(function(response) {
        if (response && (response.ok || response.type === 'opaque')) {
          var copy = response.clone();
          caches.open(CACHE_STATIC).then(function(cache) {
            cache.put(request, copy);
          });
        }
        return response;
      }).catch(function() {
        return cached;
      });
      return cached || refresh;
    })
  );
});

async function _primerPanelCacheado() {
  for (var i = 0; i < PANEL_CANDIDATES.length; i++) {
    var response = await caches.match(PANEL_CANDIDATES[i]);
    if (response) return response;
  }
  return Response.error();
}

// Al recuperar señal, avisa a las pestañas abiertas. El panel también escucha el
// evento online, por lo que la cola se sincroniza aunque Background Sync no exista.
self.addEventListener('sync', function(event) {
  if (event.tag !== 'sync-pedidos' && event.tag !== 'sync-rutas') return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windows) {
      windows.forEach(function(client) {
        client.postMessage({
          type: event.tag === 'sync-rutas' ? 'SYNC_OFFLINE_QUEUE' : 'SYNC_PEDIDOS'
        });
      });
    })
  );
});

self.addEventListener('push', function(event) {
  var data = { title: 'CoreDistri', body: '', data: {} };
  try { if (event.data) data = event.data.json(); } catch (_) {}
  event.waitUntil(
    self.registration.showNotification(data.title || data.titulo || 'CoreDistri', {
      body: data.body || data.mensaje || '',
      icon: './icon-192.png',
      badge: './icon-72.png',
      vibrate: [200, 100, 200],
      tag: 'coredistri-pedido',
      renotify: true,
      data: data.data || {},
      actions: [
        { action: 'ver', title: 'Ver pedido' },
        { action: 'cerrar', title: 'Cerrar' }
      ]
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  if (event.action === 'cerrar') return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windows) {
      var open = windows.find(function(client) { return !!client.url; });
      if (open) {
        open.focus();
        open.postMessage({ type: 'OPEN_BACKUP' });
        return;
      }
      return self.clients.openWindow('./pagina_clientes_pedidos.html');
    })
  );
});
