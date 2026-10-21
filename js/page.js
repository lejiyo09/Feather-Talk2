// 여러 화면이 함께 쓰는 것: 안전한 localStorage, 제작자 정보 패널
import { h } from './ui.js';

export const storage = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, String(v));
    } catch {
      // 기억 못 해도 지금 화면에는 적용된다
    }
  },
  int(k, def) {
    const v = parseInt(this.get(k) || '', 10);
    return Number.isNaN(v) ? def : v;
  }
};

export function creditPanel() {
  return h('section', { class: 'panel' },
    h('div', {}, h('b', {}, '제작자: 연이나')),
    h('div', { class: 'small credit' }, ' 콘셉트와 초기 구현(버전 1)은 연이나가 직접 만들었고, 버전 2의 구현은 ', h('a', { href: 'https://claude.ai' }, 'Claude'), '(Anthropic의 AI)로 제작했어요. '),
    h('div', { class: 'small' }, '연로자 연소자 여러분 하이나!! 연이나라고 합니다.'),
    h('div', { class: 'small' }, '제 개인 채널은 아래 링크에서 들어가보실 수 있어요. 원래 개발을 주력으로 하지는 않지만 잘 부탁드립니다.'),
    h('div', { class: 'small' }, h('a', { href: 'https://youtube.com/@however_ina_main' }, '유튜브'), ' 그리고 ', h('a', { href: 'https://chzzk.naver.com/1bba9a34d4d2b8b998c36c5cdbc9f4fe/' }, '치지직'), ' 링크예요. '),
    h('div', { class: 'small' }, ' Feather-Talk는 별도의 서버를 운영하지 않아요. 이미지 제작 방법은 ', h('a', { href: 'https://slashpage.com/feathertalk' }, '가이드'), '를 참고하세요. 예전 화면이 필요하면 ', h('a', { href: 'https://v2.feathertalk.live/legacy/index.html' }, '이전 버전 사용하기'), ' (원래 사이트: ', h('a', { href: 'https://feathertalk.live' }, 'feathertalk.live'), '). '),
    h('div', { class: 'small' }, '이 페이지는 원본 ', h('a', { href: 'https://v2.feathertalk.live/' }, 'Feather-Talk v2'), '의 동작을 분석해 다시 구현한 비공식 버전이에요. 기본 캐릭터 그림은 원작이 아닌 대체 그림이에요.'));
}
