const CACHE_NAME = "stimulant-journal-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./summary.html",
  "./settings.html",
  "./styles.css",
  "./journal-core.js",
  "./home.js",
  "./summary.js",
  "./settings.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./apple-touch-icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => caches.match("./index.html"));
    })
  );
});
