// Firebase Cloud Messaging service worker
// This file must be in /public so Next.js serves it at the root

importScripts('https://www.gstatic.com/firebasejs/12.12.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/12.12.1/firebase-messaging-compat.js')

// Firebase config — these values are PUBLIC (safe to expose in service worker)
firebase.initializeApp({
  apiKey: "AIzaSyDgnA1cUv6JuRZDAfaSz9R4ev_pY1xC_vM",
  authDomain: "customer-database-88e9f.firebaseapp.com",
  projectId: "customer-database-88e9f",
  storageBucket: "customer-database-88e9f.firebasestorage.app",
  messagingSenderId: "961040699391",
  appId: "1:961040699391:web:9b47f3bbcfe82186ae21ca"
})

const messaging = firebase.messaging()

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  // Web messages are deliberately data-only (no top-level `notification`),
  // so the Gmail-style display fields live in payload.data: sender as title,
  // subject as body, expandable preview as the second line. The EzyMail logo
  // (/logo.png) is a same-origin remote asset — it never travels in the
  // payload, so it renders no matter how large the email is.
  const d = payload.data || {}
  const notificationTitle = d.title || payload.notification?.title || 'New Email'
  const bodyText =
    [d.body, d.preview].filter(Boolean).join('\n') || payload.notification?.body || ''
  const notificationOptions = {
    body: bodyText,
    icon: '/logo.png',
    badge: '/logo.png',
    data: d,
    tag: d.tag || 'ezy-email',
    renotify: true,
  }

  self.registration.showNotification(notificationTitle, notificationOptions)
})

// Handle notification click — open/focus the app
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
