// 极简缓存策略：静态资产 + 数据 JSON
const CACHE = 'mc-cache-v1';
const ASSETS = [
  '/', '/index.html', '/styles.css', '/app.js',
  '/manifest.webmanifest', '/data/bwv1007_prelude.json'
  // 也可以把 icons 加进来
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 对我们的静态资源与 /data/ 走 cache-first
  if (ASSETS.includes(url.pathname) || url.pathname.startsWith('/data/')) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
    return;
  }
  // 其它请求走网络优先、失败回退缓存
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});

