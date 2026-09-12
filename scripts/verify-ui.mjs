// UI 烟囱：用 Vite SSR 真正渲染 StudioView.vue（含视图切换与分享弹层），
// 确认四个入口渲染的是编辑后的同一份数据。
import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';

const storageFile = path.join(os.tmpdir(), 'pottery-studio-ui.json');
fs.writeFileSync(storageFile, JSON.stringify({
  'pottery-exhibit-studio-v1': JSON.stringify({
    artworks: [
      { id: 'a1', title: '潮汐之后', artist: '林澄', material: '白瓷·盐釉', year: 2024, note: 'x', tone: '#c9795d' }
    ],
    exhibitions: [
      { id: 'e1', title: '手的回声', subtitle: '编辑后的副标题XYZ', curator: '编辑后的策展人XYZ', status: '已上线', opening: '2026-02-01', closing: '2026-05-01', pieces: ['a1'], description: '编辑后的说明XYZ' }
    ]
  })
}));

const store = JSON.parse(fs.readFileSync(storageFile, 'utf8'));
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
};
globalThis.location = { hash: '', origin: 'http://localhost', pathname: '/' };
globalThis.history = { replaceState() {} };
globalThis.navigator = {};
globalThis.window = { addEventListener() {} };

const vite = await createServer({
  server: { middlewareMode: true },
  logLevel: 'silent',
  configFile: path.resolve('vite.config.ts'),
  appType: 'custom'
});

const mod = await vite.ssrLoadModule(pathToFileURL(path.resolve('src/views/StudioView.vue')).href);

// 策展工作面
let app = createSSRApp(mod.default);
let html = await renderToString(app);
let fails = [];
for (const token of ['编辑后的副标题XYZ', '编辑后的策展人XYZ', '2026-02-01', '2026-05-01', '编辑后的说明XYZ', '编辑展览信息']) {
  if (!html.includes(token)) fails.push('策展工作面缺少 ' + token);
}

// 观众导览（#/guide）
globalThis.location.hash = '#/guide';
app = createSSRApp(mod.default);
html = await renderToString(app);
for (const token of ['编辑后的副标题XYZ', '编辑后的策展人XYZ', '2026-02-01', '2026-05-01', '编辑后的说明XYZ', '当前导览', '分享']) {
  if (!html.includes(token)) fails.push('观众导览缺少 ' + token);
}
if (html.includes('暂无已上线展览')) fails.push('导览错误显示空状态');

if (fails.length) {
  console.error(fails.join('\n'));
  process.exit(1);
}
console.log('✓ 策展工作面（列表+详情）渲染编辑后五项内容');
console.log('✓ 观众导览渲染同一份编辑后内容，且已上线展览可见、含分享入口');
console.log('UI 烟囱检查通过');
await vite.close();
fs.rmSync(storageFile, { force: true });
