// 기본 캐릭터 대체 그림(assets/*.png)과 앱 아이콘을 만든다.
// 사용법: npm i -D playwright 후 `node tools/export-assets.mjs` (Chromium 필요)
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const code = (await readFile(path.join(root, 'tools/default-character.js'), 'utf8')).replace(/^export /gm, '');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><body></body>');
const out = await page.evaluate((src) => {
  // eslint-disable-next-line no-new-func
  const mod = new Function(`${src}; return { SIZE, PARTS, drawIcon };`)();
  const toUrl = (w, h, fn) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    fn(c.getContext('2d'));
    return c.toDataURL('image/png');
  };
  const files = {};
  for (const [name, fn] of Object.entries(mod.PARTS)) files[`assets/${name}`] = toUrl(mod.SIZE, mod.SIZE, fn);
  files['assets/transparent.png'] = toUrl(1, 1, () => {});
  files['assets/icon.png'] = toUrl(512, 512, (ctx) => mod.drawIcon(ctx, 512));
  files['assets/icon-192.png'] = toUrl(192, 192, (ctx) => mod.drawIcon(ctx, 192));
  files['assets/apple-touch-icon.png'] = toUrl(180, 180, (ctx) => mod.drawIcon(ctx, 180));
  files['assets/icon-maskable-512.png'] = toUrl(512, 512, (ctx) => {
    ctx.fillStyle = '#86d7ff';
    ctx.fillRect(0, 0, 512, 512);
    ctx.translate(64, 64);
    mod.drawIcon(ctx, 384);
  });
  return files;
}, code);
await browser.close();
await mkdir(path.join(root, 'assets'), { recursive: true });
for (const [file, url] of Object.entries(out)) {
  await writeFile(path.join(root, file), Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', file);
}
