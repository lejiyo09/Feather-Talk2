// 편집 작업 공간: 왼쪽 미리보기 + 오른쪽 편집 패널 (베타는 레이어/캐릭터/몸 리깅 탭)
import { h, iconEl } from '../ui.js';
import { mountPreview } from './preview.js';
import { mountLayerList } from './layer-list.js';
import { mountLayerProps } from './layer-props.js';
import { mountGlobalSettings } from './global-settings.js';
import { mountBodyRig } from './body-rig.js';

const TABS = [
  ['layers', '레이어', 'layers'],
  ['character', '캐릭터', 'sliders-horizontal'],
  ['body', '몸 리깅', 'bone']
];

export function mountWorkspace(store, { tab = 'layers', onTab } = {}) {
  const preview = mountPreview(store);
  const side = h('div');
  const root = h('div', { class: 'editor-grid' }, preview, side);
  let parts = [];

  const mountAll = (...els) => {
    parts.forEach((p) => p.destroy?.());
    parts = els;
  };

  if (!store.beta) {
    mountAll(mountLayerList(store), mountLayerProps(store), mountGlobalSettings(store));
    side.append(...parts);
  } else {
    const nav = h('nav', { class: 'tabs', role: 'tablist' });
    const body = h('div');
    side.append(nav, body);
    const show = (t) => {
      tab = t;
      [...nav.children].forEach((b, i) => {
        const on = TABS[i][0] === t;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', String(on));
      });
      if (t === 'layers') mountAll(mountLayerList(store), mountLayerProps(store));
      else if (t === 'character') mountAll(mountGlobalSettings(store));
      else mountAll(mountBodyRig(store));
      body.replaceChildren(...parts);
      onTab?.(t);
    };
    for (const [key, label, ic] of TABS) {
      nav.append(h('button', { type: 'button', role: 'tab', onclick: () => show(key) }, iconEl(ic, 16), ` ${label}`));
    }
    show(TABS.some(([k]) => k === tab) ? tab : 'layers');
    root.showTab = show;
  }

  root.destroy = () => {
    preview.destroy();
    parts.forEach((p) => p.destroy?.());
  };
  return root;
}
