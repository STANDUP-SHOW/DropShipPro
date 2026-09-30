// Minimal service worker: it makes the site installable on the phone (and so
// present in Android's share menu, see manifest.webmanifest). It caches nothing:
// the site stays live, and there is nothing to invalidate on deploy.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
