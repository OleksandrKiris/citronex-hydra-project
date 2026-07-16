const CACHE_PREFIX = "citronex-hydra-srzb-";
const CACHE_NAME = CACHE_PREFIX + "20260716-diction1-hydra";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/brand/citronex-hydra-logo-web.png"
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

function networkTimeout(ms = 1400) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), ms);
  });
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

  event.respondWith((async () => {
    const accept = request.headers.get("accept") || "";
    const fallback = request.mode === "navigate" || accept.includes("text/html") ? "./index.html" : null;
    const cached = await cacheMatch(request, null);
    if (cached) {
      fetch(request).then((response) => cacheResponse(request, response)).catch(() => {});
      return cached;
    }
    try {
      const response = await Promise.race([fetch(request), networkTimeout()]);
      if (!response) return await cacheMatch(request, fallback) || Response.error();
      await cacheResponse(request, response);
      return response;
    } catch (error) {
      return await cacheMatch(request, fallback) || Response.error();
    }
  })());
});
