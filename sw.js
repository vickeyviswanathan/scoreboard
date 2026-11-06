// Service Worker: keeps Glide Brands Live Leaderboard working 100% offline
const CACHE = 'glide-scoreboard-v4';
const ASSETS = [
    './',
    './index.html',
    './css/fonts.css',
    './css/styles.css',
    './js/app.js',
    './assets/background.jpg',
    './assets/logo.png',
    './assets/fonts/bebas-neue-400.woff2',
    './assets/fonts/lexend-400.woff2',
    './assets/fonts/playfair-display-700.woff2',
    './assets/fonts/poppins-400.woff2',
    './assets/fonts/poppins-600.woff2',
    './assets/fonts/poppins-700.woff2',
    './assets/fonts/poppins-900.woff2',
    './assets/fonts/roboto-mono-700.woff2'
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    );
    self.clients.claim();
});

function saveToCache(request, response) {
    if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

    const isCode = req.mode === 'navigate' || /\.(html|css|js)$/.test(new URL(req.url).pathname) || new URL(req.url).pathname.endsWith('/');

    if (isCode) {
        event.respondWith(
            fetch(req, { cache: 'no-store' })
                .then((res) => saveToCache(req, res))
                .catch(() => caches.match(req, { ignoreSearch: true })
                    .then((cached) => cached || caches.match('./index.html')))
        );
        return;
    }

    event.respondWith(
        caches.match(req, { ignoreSearch: true }).then((cached) => cached || fetch(req).then((res) => saveToCache(req, res)))
    );
});
