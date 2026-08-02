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
  const data = payload.data || {}
  const notificationTitle = payload.notification?.title || 'New Email'
  const notificationBody = payload.notification?.body || 'You received a new message'
  const emailId = data.emailId || ''

  // Build URL to open specific email in app
  const urlToOpen = emailId ? `/inbox?id=${emailId}` : '/inbox'

  self.registration.showNotification(notificationTitle, {
    body: notificationBody,
    icon: '/logo.png',
    badge: '/logo.png',
    data: { url: urlToOpen, emailId },
    tag: data.tag || 'ezy-email',
    renotify: true,
  })
})

// ─── Notification click — open/focus the app and navigate to email ─────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const urlToOpen = event.notification.data?.url || '/inbox'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app is already open, focus it and navigate to the email
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen)
          return client.focus()
        }
      }
      // If app is closed, open it
      return self.clients.openWindow(urlToOpen)
    })
  )
})

// ─── Push event (raw Web Push fallback if FCM compat layer doesn't handle it) ──
self.addEventListener('push', (event) => {
  // FCM compat layer handles most push events via onBackgroundMessage above.
  // This is a safety net for non-FCM push events.
  if (event.data) {
    try {
      const data = event.data.json()
      // Only handle if FCM didn't already show a notification
      if (!data.from || !data.from.includes('firebase')) {
        const emailId = data.emailId || ''
        const urlToOpen = emailId ? `/inbox?id=${emailId}` : '/inbox'
        event.waitUntil(
          self.registration.showNotification(data.title || 'New Email', {
            body: data.body || 'You received a new message',
            icon: '/logo.png',
            badge: '/logo.png',
            data: { url: urlToOpen, emailId },
            tag: 'ezy-email',
            renotify: true,
          })
        )
      }
    } catch {
      // Not JSON, ignore
    }
  }
})

// ─── Cache ──────────────────────────────────────────────────────────────
const CACHE_NAME = 'ezymail-v5';
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