/* Bowling Tool service worker: lets the app open and run with no signal.
   Strategy: try the network first (so testers get updates), but fall back to
   the cached copy after 3 seconds or when offline. Bump CACHE on each release. */
const CACHE = 'bowling-tool-v125-beta62';
const SHELL = [
  './', 'index.html', 'bowler.html', 'arsenal.html', 'analyze.html', 'lane.html',
  'oil.html', 'gameday.html', 'plan.html', 'angle.html', 'scores.html', 'guide.html', 'styles.css?v=125', 'app.js?v=125', 'coach.js?v=125', 'chart.js?v=125', 'pinpal.js?v=125', 'history.js?v=125', 'plan.js?v=125', 'insight.js?v=125', 'cloud.js?v=125', 'stats.js?v=125', 'replay.js?v=125', 'trends.js?v=125',
  'databalls.csv', 'manifest.webmanifest',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const u = new URL(req.url);
  // Sign-in and cloud backup always go to the network, never the cache.
  if (req.method !== 'GET' || u.origin !== self.location.origin || u.pathname.startsWith('/.netlify/') || u.pathname.startsWith('/api/')) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await Promise.race([fetch(req), timeout(3000)]);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (_err) {
      const hit = await cache.match(req) || await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});
