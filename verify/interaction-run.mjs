// 真实 DOM（happy-dom）加载 StudioView.vue（经 Vite 客户端转换 + rolldown 打包），
// 模拟点击上移/下移、HTML5 拖放、加入/移出与切换展览。
import { Window } from 'happy-dom';
import assert from 'node:assert/strict';

const Studio = globalThis.__STUDIO__;

const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
globalThis.navigator = win.navigator;
globalThis.HTMLElement = win.HTMLElement;
globalThis.Node = win.Node;
globalThis.MouseEvent = win.MouseEvent;
globalThis.Event = win.Event;
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.localStorage = win.localStorage;

const { createApp, nextTick } = await import('vue');

const STORE_KEY = 'pottery-exhibit-studio-v1';

function seed() {
  const data = {
    exhibitions: [
      { id: 'e1', title: '展一', subtitle: 's', curator: 'c', status: '草稿', opening: '2025-01-01', closing: '2025-02-01', pieces: ['a1', 'a3'], description: 'd' },
      { id: 'e2', title: '展二', subtitle: 's', curator: 'c', status: '草稿', opening: '2025-02-01', closing: '2025-03-01', pieces: ['a2'], description: 'd' },
    ],
    artworks: [
      { id: 'a1', title: '作品甲', artist: 'x', material: 'm', year: 2024, note: 'n', tone: '#000' },
      { id: 'a2', title: '作品乙', artist: 'x', material: 'm', year: 2024, note: 'n', tone: '#000' },
      { id: 'a3', title: '作品丙', artist: 'x', material: 'm', year: 2024, note: 'n', tone: '#000' },
      { id: 'a4', title: '作品丁', artist: 'x', material: 'm', year: 2024, note: 'n', tone: '#000' },
    ],
  };
  win.localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

function cards() {
  return [...win.document.querySelectorAll('.piece')];
}
function cardByTitle(title) {
  return cards().find((c) => c.textContent.includes(title));
}
function clickButton(card, text) {
  const btn = [...card.querySelectorAll('button')].find((b) => b.textContent.includes(text));
  assert.ok(btn, `应找到按钮：${text}`);
  btn.click();
}

seed();
document.body.innerHTML = '<div id="app"></div>';
const app = createApp(Studio);
app.mount('#app');
await nextTick();

// 初始：已编排 a1、a3 按顺序置顶，a2/a4 在后
assert.deepEqual(
  cards().map((c) => c.querySelector('h3').textContent),
  ['作品甲', '作品丙', '作品乙', '作品丁'],
);
assert.equal(cardByTitle('作品甲').querySelector('.order-badge').textContent.replace(/\s+/g, ''), '⋮⋮1');

// 点击 a1 的“下移”
clickButton(cardByTitle('作品甲'), '下移');
await nextTick();
assert.deepEqual(
  cards().map((c) => c.querySelector('h3').textContent),
  ['作品丙', '作品甲', '作品乙', '作品丁'],
);
assert.equal(cardByTitle('作品丙').querySelector('.order-badge').textContent.replace(/\s+/g, ''), '⋮⋮1');

// 上移恢复
clickButton(cardByTitle('作品甲'), '上移');
await nextTick();
assert.deepEqual(
  cards().slice(0, 2).map((c) => c.querySelector('h3').textContent),
  ['作品甲', '作品丙'],
);

// 模拟 HTML5 拖放：把 a3 拖到第 1 位
const a3 = cardByTitle('作品丙');
a3.dispatchEvent(new win.Event('dragstart'));
const a1 = cardByTitle('作品甲');
a1.dispatchEvent(new win.Event('dragover', { cancelable: true }));
a1.dispatchEvent(new win.Event('drop'));
a3.dispatchEvent(new win.Event('dragend'));
await nextTick();
assert.deepEqual(
  cards().slice(0, 2).map((c) => c.querySelector('h3').textContent),
  ['作品丙', '作品甲'],
);

// 工作面、详情、导览、导出四处指纹一致
const fps = [...win.document.querySelectorAll('.fingerprint code, .entry-fp code')].map((n) => n.textContent);
assert.ok(fps.length >= 4, `至少 4 个指纹入口，实际 ${fps.length}`);
for (const fp of fps) assert.equal(fp, 'a3›a1');

// localStorage 已实时更新
let stored = JSON.parse(win.localStorage.getItem(STORE_KEY));
assert.deepEqual(stored.exhibitions[0].pieces, ['a3', 'a1']);

// 把未编排的 a4 加入展览：追加到末尾
clickButton(cardByTitle('作品丁'), '加入展览');
await nextTick();
stored = JSON.parse(win.localStorage.getItem(STORE_KEY));
assert.deepEqual(stored.exhibitions[0].pieces, ['a3', 'a1', 'a4']);

// 切换到 e2 再回来：顺序不变，且 e2 自己的编排不受 e1 操作影响
const rail2 = [...win.document.querySelectorAll('.exhibit-row')].find((r) => r.textContent.includes('展二'));
rail2.dispatchEvent(new win.MouseEvent('click'));
await nextTick();
assert.equal(win.document.querySelector('.fingerprint code').textContent, 'a2');
const rail1 = [...win.document.querySelectorAll('.exhibit-row')].find((r) => r.textContent.includes('展一'));
rail1.dispatchEvent(new win.MouseEvent('click'));
await nextTick();
assert.equal(win.document.querySelector('.fingerprint code').textContent, 'a3›a1›a4');

// 移出 a1：顺序数组移除但作品档案仍在
clickButton(cardByTitle('作品甲'), '移出');
await nextTick();
stored = JSON.parse(win.localStorage.getItem(STORE_KEY));
assert.deepEqual(stored.artworks.map((a) => a.id), ['a1', 'a2', 'a3', 'a4']);
assert.deepEqual(stored.exhibitions[0].pieces, ['a3', 'a4']);
assert.deepEqual(stored.exhibitions[1].pieces, ['a2']);

// 刷新恢复：销毁后用同一存档重新挂载，顺序依旧
app.unmount();
document.body.innerHTML = '<div id="app2"></div>';
const app2 = createApp(Studio);
app2.mount('#app2');
await nextTick();
assert.equal(win.document.querySelector('.fingerprint code').textContent, 'a3›a4');
app2.unmount();

console.log('interaction: 上移/下移、拖放、加入移出、切换展览与刷新恢复全部通过');
