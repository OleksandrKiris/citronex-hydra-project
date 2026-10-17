const CACHE_PREFIX = "citronex-hydra-srzb-";
const CACHE_NAME = CACHE_PREFIX + "20261017-last-location2";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/brand/primserv-logo.svg",
  "./assets/brand/primserv-icon-192.png",
  "./assets/brand/primserv-icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(CORE_ASSETS.map(async (asset) => {
      try {
        await cache.add(new Request(asset, { cache: "reload" }));
      } catch (error) {
        // The start page should still install even if one optional asset fails.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function cacheResponse(request, response) {
  if (!response || !response.ok) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}

async function fetchWithTimeout(request, ms = 1400) {
  let timer;
  try {
    return await Promise.race([
      fetch(request),
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function cacheMatch(request, fallback = null) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true }) || await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  if (!fallback) return null;
  return cache.match(fallback, { ignoreSearch: true }) || caches.match(fallback, { ignoreSearch: true });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes("/assets/audio/")) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  if (request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html")) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: "no-store" });
        await cacheResponse(request, response);
        return response;
      } catch (error) {
        return await cacheMatch(request, "./index.html") || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await cacheMatch(request);
    if (cached) {
      fetch(request).then((response) => cacheResponse(request, response)).catch(() => {});
      return cached;
    }
    try {
      const response = await fetchWithTimeout(request);
      if (!response) return await cacheMatch(request) || Response.error();
      await cacheResponse(request, response);
      return response;
    } catch (error) {
      return await cacheMatch(request) || Response.error();
    }
  })());
});
