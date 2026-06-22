const CACHE_NAME = "hecheng-xuling-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./main.js",
  "./manifest.webmanifest",
  "./assets/photos/cover.jpg",
  "./assets/photos/level-1.jpg",
  "./assets/photos/level-2.jpg",
  "./assets/photos/level-3.jpg",
  "./assets/photos/level-4.jpg",
  "./assets/photos/level-5.jpg",
  "./assets/photos/level-6.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
