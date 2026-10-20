// 서비스 워커 등록 (오프라인 실행, 설치 가능)
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const register = () => navigator.serviceWorker.register('sw.js').catch((err) => console.warn('서비스 워커를 등록하지 못했어요', err));
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register);
}
