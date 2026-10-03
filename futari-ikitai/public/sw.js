// ホーム画面に追加できるようにするための最小限の Service Worker。
// 画面のファイルだけキャッシュし、API は常にネットワークから取る。
const CACHE = "ikitai-v3";
const SHELL = ["/", "/style.css", "/main.js", "/core.js", "/smart.js", "/util.js", "/lib/analyze.js", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // ネットワーク優先、つながらないときだけキャッシュ
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && (SHELL.includes(url.pathname) || url.pathname.startsWith("/img/"))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/")))
  );
});
