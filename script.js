'use strict';

// 네트워크 상태 표시
const netStatus = document.getElementById('net-status');
function updateNetStatus() {
  netStatus.textContent = navigator.onLine ? '온라인' : '오프라인';
}
window.addEventListener('online', updateNetStatus);
window.addEventListener('offline', updateNetStatus);
updateNetStatus();

// 서비스 워커 등록
const swStatus = document.getElementById('sw-status');
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('sw.js');
      swStatus.textContent = '등록됨';
    } catch (err) {
      swStatus.textContent = '등록 실패';
      console.error('Service worker registration failed:', err);
    }
  });
} else {
  swStatus.textContent = '지원하지 않는 브라우저';
}

// 설치 프롬프트 (Chromium 계열)
const installBtn = document.getElementById('install-btn');
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});
installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.hidden = true;
});
window.addEventListener('appinstalled', () => { installBtn.hidden = true; });
