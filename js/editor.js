// 편집기 화면 (정식판 / 베타): 상단 막대, 사용법(베타는 시작하기 체크리스트), 작업 공간, 제작자 정보
import { createStore } from './store.js';
import { mountWorkspace } from './workspace/index.js';
import { h, iconEl } from './ui.js';
import { isBeta, basePath } from './env.js';
import { registerServiceWorker } from './pwa.js';
import { creditPanel, storage as ls } from './page.js';

const beta = isBeta();
const base = basePath();
const store = createStore(beta);
const app = document.getElementById('app');

// ───────── 상단 막대 ─────────
const importInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
importInput.addEventListener('change', async () => {
  const file = importInput.files?.[0];
  importInput.value = '';
  if (!file || !confirm('지금 설정을 백업 파일 내용으로 바꿀까요?')) return;
  try {
    await store.importBackup(file);
  } catch (err) {
    console.error(err);
    alert('백업 파일을 읽지 못했어요.');
  }
});

let guideOpen = !ls.get('ftGuideDone');
const navbar = h('header', { class: 'navbar' },
  h('h2', { class: 'logo' }, 'Feather-Talk ', beta ? h('span', { class: 'beta-badge', title: '새 기능을 먼저 시험하는 곳이에요. 정식판과 설정이 따로 저장돼요.' }, 'BETA') : null),
  h('div', { class: 'nav-actions' },
    h('button', { type: 'button', class: 'ghost', onclick: () => toggleGuide() }, iconEl('circle-help', 15), ' 사용법'),
    h('button', {
      type: 'button',
      class: 'ghost',
      title: '레이어 설정과 업로드한 이미지를 파일 하나로 저장해요',
      onclick: () => store.exportBackup().catch((err) => {
        console.error(err);
        alert('백업 파일을 만들지 못했어요.');
      })
    }, '백업 내보내기'),
    h('button', { type: 'button', class: 'ghost', title: '백업 파일에서 불러와요 (지금 설정은 덮어써져요)', onclick: () => importInput.click() }, '불러오기'),
    importInput,
    h('button', {
      type: 'button',
      class: 'ghost',
      title: 'assets 폴더의 기본 그림으로 처음부터 시작해요',
      onclick: () => {
        if (confirm('assets 폴더의 기본 캐릭터로 되돌릴까요?\n지금 레이어 설정과 업로드한 파일이 모두 지워져요. 필요하면 먼저 "백업 내보내기"를 해 두세요.')) store.reset();
      }
    }, '기본 캐릭터로 되돌리기'),
    beta ? h('a', { class: 'ghost', href: '/' }, '정식판으로') : null,
    h('a', { class: 'button', href: `${base}/live.html` }, '라이브 시작 ', iconEl('play', 14))));

// ───────── 사용법 ─────────
const guideSlot = h('div');
function closeGuide() {
  guideOpen = false;
  ls.set('ftGuideDone', '1');
  guideSlot.replaceChildren();
}
function toggleGuide() {
  if (guideOpen) return closeGuide();
  guideOpen = true;
  guideSlot.replaceChildren(beta ? startSteps() : guideCard());
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function guideCard() {
  return h('section', { class: 'panel guide' },
    h('button', { type: 'button', class: 'close', title: '닫기', onclick: closeGuide }, iconEl('x', 20)),
    h('h3', {}, '처음 오셨나요? 세 단계면 충분해요'),
    h('ol', { class: 'steps' },
      h('li', {}, h('b', {}, '레이어 넣기'), h('span', {}, ' 오른쪽 ', h('em', {}, '+ 레이어 추가'), '로 부위를 고르고, 이미지 주소를 붙여넣거나 파일을 끌어다 놓으세요. 모든 이미지는 같은 크기의 정사각형 PNG(투명 배경)로, 캐릭터 전체 그림에서 해당 부위만 남긴 형태여야 해요. ')),
      h('li', {}, h('b', {}, '얼굴 중심 맞추기'), h('span', {}, ' 미리보기의 ', h('em', {}, '+ 십자 표시'), '를 끌어 얼굴 한가운데(코 근처)에 두고, 점선 원을 끌어 얼굴 크기에 맞추세요. 고개를 위아래·좌우로 돌릴 때 이 점이 기준이 돼요. ')),
      h('li', {}, h('b', {}, '입체감과 머리카락'), h('span', {}, ' 레이어를 골라 ', h('em', {}, '깊이'), '와 ', h('em', {}, '볼록/오목'), '을 조절하고, 머리카락 레이어는 ', h('em', {}, '머리카락 물리'), '를 켜 주세요. 미리보기 위에서 마우스를 움직이면 바로 확인할 수 있어요. '))));
}

// 베타 '시작하기': 할 일 4개, 해낸 것은 체크
const STEPS_KEY = 'ftStepsBeta';
const stepsDone = (() => {
  try {
    return JSON.parse(ls.get(STEPS_KEY) || '{}');
  } catch {
    return {};
  }
})();
function startSteps() {
  const list = h('ol', { class: 'list' });
  const count = h('small');
  const el = h('section', { class: 'panel start' },
    h('button', { type: 'button', class: 'close', title: "닫기 (상단의 '사용법'으로 다시 열 수 있어요)", onclick: closeGuide }, iconEl('x', 18)),
    h('h3', {}, '시작하기 ', count), list);
  el.refresh = () => {
    const items = [
      { title: '내 그림 넣기', desc: '레이어를 고르고 이미지를 올려요', ok: store.model.layers.some((l) => l.src.value && !l.src.value.startsWith('/assets/')), tab: 'layers' },
      { title: '얼굴 중심 맞추기', desc: '미리보기의 + 와 점선 원을 얼굴에', ok: !!stepsDone.center, tab: 'character' },
      { title: '입체감 조절', desc: '레이어마다 깊이·볼록을 조절해요', ok: !!stepsDone.depth, tab: 'layers' },
      { title: '라이브 시작', desc: 'OBS 등에서 캡처해요', ok: !!stepsDone.live, tab: null }
    ];
    count.textContent = `${items.filter((i) => i.ok).length} / ${items.length}`;
    list.replaceChildren(...items.map((it, i) => h('li', { class: it.ok ? 'ok' : '' },
      h('button', {
        type: 'button',
        onclick: () => {
          if (it.tab) {
            workspace.showTab?.(it.tab);
            return;
          }
          stepsDone.live = true;
          ls.set(STEPS_KEY, JSON.stringify(stepsDone));
          location.href = `${base}/live.html`;
        }
      }, h('span', { class: 'mark' }, it.ok ? iconEl('check', 14) : String(i + 1)), h('span', { class: 'text' }, h('b', {}, it.title), h('span', {}, it.desc))))));
  };
  el.refresh();
  return el;
}

// 얼굴 중심이나 깊이·볼록을 한 번이라도 바꾸면 해당 단계를 체크
const depthKey = () => store.model.layers.map((l) => `${l.depth},${l.curve}`).join();
let lastCenter = JSON.stringify(store.model.center);
let lastDepth = depthKey();
store.on(() => {
  if (!beta) return;
  const c = JSON.stringify(store.model.center);
  const d = depthKey();
  let dirty = false;
  if (c !== lastCenter) {
    lastCenter = c;
    if (!stepsDone.center) dirty = stepsDone.center = true;
  }
  if (d !== lastDepth) {
    lastDepth = d;
    if (!stepsDone.depth) dirty = stepsDone.depth = true;
  }
  if (dirty) ls.set(STEPS_KEY, JSON.stringify(stepsDone));
  guideSlot.firstChild?.refresh?.();
});

// ───────── 화면 조립 ─────────
const workspace = mountWorkspace(store, {
  tab: ls.get('ftTabBeta') || 'layers',
  onTab: (t) => ls.set('ftTabBeta', t)
});
if (guideOpen) guideSlot.append(beta ? startSteps() : guideCard());

app.replaceChildren(navbar, h('main', { class: 'wrapper' }, guideSlot, workspace, creditPanel()));
registerServiceWorker();
