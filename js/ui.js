// 작은 DOM 도우미와 공용 부품 (슬라이더 칸, 설명 툴팁, 접히는 묶음)
import { icon } from './icons.js';

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export const iconEl = (name, size, cls = '') => {
  const t = document.createElement('template');
  t.innerHTML = icon(name, size, cls);
  return t.content.firstChild;
};

export function svg(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// ⓘ 단추: 올리거나 누르면 설명이 뜬다 (베타 화면)
export function infoTip(...content) {
  const pop = h('span', { class: 'info-pop', role: 'tooltip' }, ...content);
  pop.hidden = true;
  const btn = h('button', { type: 'button', class: 'info-btn', 'aria-label': '설명 보기' }, iconEl('info', 14));
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    pop.hidden = !pop.hidden;
  });
  const el = h('span', { class: 'info' }, btn, pop);
  el.addEventListener('mouseenter', () => { pop.hidden = false; });
  el.addEventListener('mouseleave', () => { pop.hidden = true; });
  return el;
}

// 정식판은 설명 문단, 베타는 ⓘ 툴팁
export function hint(beta, ...content) {
  return beta ? infoTip(...content) : h('p', { class: 'desc' }, ...content);
}

const GROUP_KEY = 'ftGroupOpen';
function groupStates() {
  try {
    return JSON.parse(localStorage.getItem(GROUP_KEY) || '{}');
  } catch {
    return {};
  }
}

// 묶음: 정식판은 소제목, 베타는 펼치고 접는 칸 (열림 상태 기억, 접히면 요약 표시)
export function group(beta, { id, title, summary, help, open = false }, ...children) {
  if (!beta) {
    const el = h('div', { style: { display: 'contents' } }, h('h4', {}, title), ...children);
    el.refresh = () => {};
    return el;
  }
  let isOpen = groupStates()[id] ?? open;
  const sum = h('span', { class: 'group-summary' });
  const body = h('div', { class: 'group-body' }, ...children);
  const head = h('button', { type: 'button', class: 'group-head' }, iconEl('chevron-right', 16, 'chev'), h('span', { class: 'group-title' }, title), help ? infoTip(help) : null, sum);
  const el = h('div', { class: 'group' }, head, body);
  const refresh = () => {
    el.classList.toggle('open', isOpen);
    head.setAttribute('aria-expanded', String(isOpen));
    body.hidden = !isOpen;
    const s = typeof summary === 'function' ? summary() : summary;
    sum.textContent = s || '';
    sum.hidden = !s || isOpen;
  };
  head.addEventListener('click', () => {
    isOpen = !isOpen;
    const all = groupStates();
    all[id] = isOpen;
    try {
      localStorage.setItem(GROUP_KEY, JSON.stringify(all));
    } catch {
      // 기억 못 해도 지금은 열린다
    }
    refresh();
  });
  refresh();
  el.refresh = refresh;
  return el;
}

// 슬라이더 칸: 이름·값, 양쪽 끝 이름, 설명. ±snap 안이면 0, 더블클릭이면 기본값
export function rangeField(beta, { label, left, right, min, max, step = 1, def, snap, desc, format, get, set, iconNode }) {
  const out = h('output');
  const input = h('input', { type: 'range', min, max, step, 'aria-label': label });
  const fmt = (v) => (format ? format(v) : v);
  const show = () => {
    const v = get();
    input.value = v;
    out.textContent = fmt(v);
  };
  input.addEventListener('input', () => {
    let v = parseFloat(input.value);
    if (snap && Math.abs(v) <= snap) {
      v = 0;
      input.value = '0';
    }
    set(v);
    out.textContent = fmt(v);
  });
  input.addEventListener('dblclick', () => {
    if (def === undefined) return;
    set(typeof def === 'function' ? def() : def);
    show();
  });
  show();
  const el = h('div', { class: 'field' },
    h('div', { class: 'field-head' }, h('b', {}, label), desc && beta ? infoTip(desc) : null, iconNode || null, out),
    h('div', { class: 'range' }, h('span', {}, left), input, h('span', {}, right)),
    desc && !beta ? h('p', { class: 'desc' }, desc) : null);
  el.refresh = show;
  return el;
}

export const signed = (v) => (v > 0 ? '+' : '') + v;
export const percent = (v) => `${Math.round(v * 100)}%`;
