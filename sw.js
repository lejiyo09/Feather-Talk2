'use strict';
// 네트워크 우선 + 오프라인 캐시. 온라인이면 항상 최신 배포본을 쓴다.
const CACHE = 'ft-v2-clone-4';
const SHELL = [
  '/', '/index.html', '/live.html', '/beta/', '/beta/index.html', '/beta/live.html', '/multi/', '/multi/index.html', '/multi/live.html',
  '/style.css', '/manifest.webmanifest',
  '/js/editor.js', '/js/live.js', '/js/multi.js', '/js/multi-live.js', '/js/multi-core.js', '/js/store.js', '/js/model.js',
  '/js/default-preset.js', '/js/renderer.js', '/js/rig.js', '/js/motion.js', '/js/icons.js', '/js/ui.js', '/js/env.js',
  '/js/page.js', '/js/webcam.js', '/js/pwa.js',
  '/js/workspace/index.js', '/js/workspace/preview.js', '/js/workspace/layer-list.js', '/js/workspace/layer-props.js',
  '/js/workspace/global-settings.js', '/js/workspace/body-rig.js',
  '/assets/bang.png', '/assets/mouth.png', '/assets/mouthopen.png', '/assets/eyes.png', '/assets/eyesclosed.png',
  '/assets/face.png', '/assets/body.png', '/assets/back.png', '/assets/transparent.png', '/assets/icon-192.png', '/assets/icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('/index.html') : Response.error())))
  );
});
