/* Groundwork service worker — makes the app work offline.
   The app is a single index.html plus three Firebase CDN scripts and Google Fonts,
   so the shell + those assets are what we cache. */

const CACHE = "groundwork-v1";

const SHELL = ["./", "./index.html"];

/* Hosts whose GET responses we're allowed to cache (assets only — never the
   Firestore/Auth APIs, which run on other *.googleapis.com hosts). */
const CACHE_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com", "www.gstatic.com"];

const PRECACHE_URLS = [
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js",
  "https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL).catch(() => {});
    /* Cross-origin assets are opaque (no-cors) — store each individually so one
       failure doesn't abort the whole install. */
    await Promise.all(PRECACHE_URLS.map(async (url) => {
      try {
        const res = await fetch(url, { mode: "no-cors", credentials: "omit" });
        await cache.put(url, res);
      } catch (e) { /* ignore — still usable online */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  /* App navigations: network-first so updates land, cache as offline fallback. */
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        if (fresh && fresh.ok) {
          cache.put("./index.html", fresh.clone());
          cache.put("./", fresh.clone());
        }
        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE);
        return (await cache.match(req)) ||
               (await cache.match("./index.html")) ||
               (await cache.match("./")) ||
               Response.error();
      }
    })());
    return;
  }

  /* Everything else: only cache same-origin files and whitelisted asset hosts. */
  const sameOrigin = url.origin === self.location.origin;
  const isCachedHost = CACHE_HOSTS.indexOf(url.hostname) !== -1;
  if (!sameOrigin && !isCachedHost) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh && (fresh.ok || fresh.type === "opaque")) cache.put(req, fresh.clone());
      return fresh;
    } catch (e) {
      return Response.error();
    }
  })());
});
