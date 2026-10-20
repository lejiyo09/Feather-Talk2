'use strict';

// 앱 셸 캐시. 파일이 바뀌면 버전을 올려 이전 캐시를 정리한다.
const CACHE_VERSION = 'ft-shell-v2';
const APP_SHELL = [
  './',
  'index.html',
  'style.css',
  'script.js',
  'js/store.js',
  'js/renderer.js',
  'js/motion.js',
  'js/default-character.js',
  'manifest.webmanifest',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // 네트워크 우선: 온라인이면 항상 최신 배포본, 오프라인이면 캐시
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) =>
          cached || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())
        )
      )
  );
});
