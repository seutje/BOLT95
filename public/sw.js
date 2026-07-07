const CACHE_VERSION = "0.1.0";
const SHELL_CACHE = `bolt95-shell-v${CACHE_VERSION}`;
const APP_SHELL = ["./", "./manifest.webmanifest", "./icons/bolt95.svg"];

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function isModelUrl(url) {
  return /\/models\/.+\.bin$/u.test(url.pathname);
}

function isRuntimeAsset(url) {
  return /\/assets\/.+\.(?:js|css|wasm)$/u.test(url.pathname);
}

function shouldCache(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (!sameOrigin(url) || isModelUrl(url)) return false;
  return (
    isRuntimeAsset(url) ||
    APP_SHELL.some((asset) => new URL(asset, self.location.href).href === url.href)
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith("bolt95-shell-") && name !== SHELL_CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (!shouldCache(event.request)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, copy)));
        }
        return response;
      });
    }),
  );
});
