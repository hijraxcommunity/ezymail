// ─── Firebase Cloud Messaging (must be at top) ────────────────────────────
importScripts('https://www.gstatic.com/firebasejs/12.12.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/12.12.1/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: "AIzaSyDgnA1cUv6JuRZDAfaSz9R4ev_pY1xC_vM",
  authDomain: "customer-database-88e9f.firebaseapp.com",
  projectId: "customer-database-88e9f",
  storageBucket: "customer-database-88e9f.firebasestorage.app",
  messagingSenderId: "961040699391",
  appId: "1:961040699391:web:9b47f3bbcfe82186ae21ca"
})

// Handle FCM background messages
firebase.messaging().onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification?.title || 'New Email'
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/logo.png',
    badge: '/logo.png',
    data: payload.data || {},
    tag: payload.data?.tag || 'ezy-email',
    renotify: true,
  }
  self.registration.showNotification(notificationTitle, notificationOptions)
})

// ─── Notification click — open/focus the app ─────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const urlToOpen = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen)
          return client.focus()
        }
      }
      return self.clients.openWindow(urlToOpen)
    })
  )
})

// ─── Cache ──────────────────────────────────────────────────────────────
const CACHE_NAME = 'ezymail-v3';
const STATIC_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/favicon-32.png',
  '/logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ─── Fetch: network-first for pages, cache-first for static ─────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin || request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;

  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2?)$/) ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match('/offline.html'))
  );
});