// 멀티 라이브 (베타): 무대를 화면 가득 보여 주고, 화면 캡처로 말하는 캐릭터의 입을 움직인다
import { useBetaStorage, loadSlots, watchSlots } from './model.js';
import { TalkDetector, loadSettings, mountStage } from './multi-core.js';
import { h, iconEl } from './ui.js';
import { registerServiceWorker } from './pwa.js';

useBetaStorage(true);
const slots = loadSlots().slots;
const settings = loadSettings();
document.body.style.backgroundColor = settings.background;

const detector = new TalkDetector();
const talking = Array(10).fill(false);
let capturing = false;

const stage = mountStage({ settings: () => settings, models: () => slots, talking: () => talking });
watchSlots((next) => {
  next.forEach((m, i) => { slots[i] = m; });
  stage.refreshModels();
});

const capBtn = h('button', { type: 'button', class: 'cap' });
const hint = h('span', { class: 'hint' });
function renderControls() {
  capBtn.classList.toggle('on', capturing);
  capBtn.replaceChildren(iconEl('monitor-up', 15), ` ${capturing ? '화면 캡처 중지' : '화면 캡처 시작'}`);
  const allRegions = settings.chars.filter((c) => c.on).every((c) => c.region);
  if (!capturing) {
    hint.className = 'hint';
    hint.textContent = 'SYNCROOM이나 Discord 창을 공유하면 말하는 캐릭터의 입이 움직여요.';
    hint.hidden = false;
  } else {
    hint.className = 'hint warn';
    hint.textContent = '감지 영역을 지정하지 않은 캐릭터가 있어요 (설정에서 지정).';
    hint.hidden = allRegions;
  }
}

detector.onFrame = () => {
  let flip = false;
  for (let i = 0; i < 10; i++) {
    if (talking[i] !== detector.talking[i]) flip = true;
    talking[i] = detector.talking[i];
  }
  if (flip) stage.place();
};
detector.onStop = () => {
  capturing = false;
  talking.fill(false);
  renderControls();
  stage.place();
};
capBtn.addEventListener('click', async () => {
  if (detector.running) {
    detector.stop();
    return;
  }
  try {
    await detector.start();
  } catch (err) {
    alert(`화면 캡처를 시작하지 못했어요: ${err?.message || err}`);
    return;
  }
  capturing = true;
  detector.run(() => settings);
  renderControls();
});

// 캡처 중에는 2초 동안 마우스를 안 움직이면 조작 막대·커서를 숨긴다
let idleTimer = 0;
document.addEventListener('mousemove', () => {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.toggle('idle', capturing), 2000);
});

document.getElementById('app').replaceChildren(h('div', { class: 'mlive' },
  h('div', { class: 'controls' }, h('a', { href: '/multi/', class: 'back' }, iconEl('arrow-left', 15), ' 설정'), capBtn, hint),
  h('div', { class: 'stage-box' }, stage)));
renderControls();
window.addEventListener('pagehide', () => detector.stop());
registerServiceWorker();
