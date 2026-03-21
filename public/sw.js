const CACHE_NAME = 'bettracker-v2';
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

const APP_ROUTES = ['/', '/statistics', '/ranking', '/finance', '/tickets'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isNavigation = request.mode === 'navigate';
  const isAppRoute = APP_ROUTES.some((route) => url.pathname === route || url.pathname.startsWith(`${route}/`));

  // App routes should always try network first to avoid stale ranking/ticket data.
  if (isNavigation || (isSameOrigin && isAppRoute)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Static assets can be served cache-first.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });

        return response;
      });
    })
  )
});

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload = {}
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'BetTracker', body: event.data.text() }
  }

  const title = payload.title || 'BetTracker'
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192x192.png',
    badge: payload.badge || '/icons/icon-192x192.png',
    tag: payload.tag || 'bettracker-notification',
    data: {
      url: payload.url || '/tickets',
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const rawTargetUrl = event.notification?.data?.url || '/tickets'
  const targetUrl = new URL(rawTargetUrl, self.location.origin).toString()

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          await client.focus()
          return
        }
      }

      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) {
            await client.navigate(targetUrl)
          }
          return
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl)
      }
      return
    }),
  )
})
