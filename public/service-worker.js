// sw.js - FA Markup Tool Service Worker

// This service worker caches essential files for offline use and faster loading.
// It uses a cache-first strategy for assets and falls back to the network when necessary.

// 🔄 Increment this version when you update files
const APP_VERSION = "v1.0.1";  
const CACHE_NAME = `fa-markup-cache-${APP_VERSION}`;

const ASSETS = [
  "/",                
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js"
];

// Install: cache assets
self.addEventListener("install", event => {
  console.log(`[SW] Installing ${APP_VERSION}...`);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: cleanup old caches
self.addEventListener("activate", event => {
  console.log(`[SW] Activating ${APP_VERSION}`);
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log(`[SW] Deleting old cache: ${k}`);
          return caches.delete(k);
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: serve cached or fallback
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(cachedRes => {
      return (
        cachedRes ||
        fetch(event.request).catch(() => {
          if (event.request.mode === "navigate") {
            return caches.match("/index.html");
          }
        })
      );
    })
  );
});
