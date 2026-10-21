// 어떤 화면인지: 정식판(/), 베타(/beta), 멀티(/multi, 베타 기능과 캐릭터 슬롯을 같이 씀)
export const isBeta = () => location.pathname.startsWith('/beta') || location.pathname.startsWith('/multi');
export const basePath = () => (location.pathname.startsWith('/beta') ? '/beta' : '');
