// Service Worker — обеспечивает работу приложения офлайн
const CACHE_NAME = 'family-budget-v5';

// Предкэшируем ТОЛЬКО локальные файлы.
// Внешние CDN не предзагружаем — они кэшируются при первом обычном fetch.
// (Предкэш CDN в режиме no-cors давал opaque responses, которые на старте
// возвращались вместо реального React/Recharts/Firebase и ломали приложение.)
const URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
    await self.clients.claim();
    // После смены версии кэша — принудительно перезагружаем все открытые вкладки/PWA,
    // чтобы старый HTML со старыми кэшированными ссылками не остался на экране.
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((c) => { try { c.navigate(c.url); } catch {} });
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Firestore/Firebase API трогать нельзя — это реалтайм стримы, им нужен живой fetch
  const url = req.url;
  if (url.includes('firestore.googleapis.com') || url.includes('firebaseio.com') || url.includes('googleapis.com')) {
    return; // пусть идёт напрямую в сеть
  }

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) {
      // Обновляем кэш в фоне
      fetch(req).then((response) => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          caches.open(CACHE_NAME).then((cache) => cache.put(req, response.clone())).catch(() => {});
        }
      }).catch(() => {});
      return cached;
    }
    try {
      const response = await fetch(req);
      if (response && response.status === 200 && response.type !== 'opaque') {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
      }
      return response;
    } catch (e) {
      // Нет сети и нет в кэше — отдаём fallback index.html для навигаций
      if (req.mode === 'navigate') {
        const fallback = await caches.match('./index.html');
        if (fallback) return fallback;
      }
      throw e;
    }
  })());
});
