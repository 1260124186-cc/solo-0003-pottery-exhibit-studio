// 通过 Vite SSR 真实渲染 StudioView.vue，校验网格 / 详情 / 导览 / 导出
// 四个入口读到的顺序与数量来自同一份 pieces。
import { createServer } from 'vite';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import assert from 'node:assert/strict';

const STORE_KEY = 'pottery-exhibit-studio-v1';

function storageSeed(exhibitions) {
  const artworks = [
    { id: 'a1', title: '潮汐之后', artist: '林澄', material: '白瓷', year: 2024, note: '潮线', tone: '#c9795d' },
    { id: 'a2', title: '折光容器', artist: '周野', material: '粗陶', year: 2023, note: '折面', tone: '#8b7355' },
    { id: 'a3', title: '未完成的圆', artist: '沈禾', material: '炻器', year: 2024, note: '手指痕迹', tone: '#6d8b82' },
    { id: 'a4', title: '风从南方来', artist: '叶青', material: '瓷板', year: 2022, note: '季风', tone: '#5d7ea4' },
  ];
  return JSON.stringify({ [STORE_KEY]: JSON.stringify({ exhibitions, artworks }) });
}

class MemoryStorage {
  constructor(seedJson) {
    this.map = new Map(Object.entries(JSON.parse(seedJson)));
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
}

const e1 = (pieces) => ({
  id: 'e1', title: '手的回声', subtitle: 's', curator: '陈默', status: '预览中',
  opening: '2024-09-12', closing: '2024-11-30', pieces, description: 'd',
});
const e2 = (pieces) => ({
  id: 'e2', title: '光的容器', subtitle: 's', curator: '周宁', status: '草稿',
  opening: '2024-12-01', closing: '2025-01-15', pieces, description: 'd',
});

async function renderStudio(seedEnv) {
  globalThis.localStorage = new MemoryStorage(seedEnv);
  const server = await createServer({
    root: process.cwd(),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
  try {
    const mod = await server.ssrLoadModule('/src/views/StudioView.vue');
    const html = await renderToString(createSSRApp(mod.default));
    return html;
  } finally {
    await server.close();
  }
}

// 场景 A：e1 自定义顺序 [a3,a1]，默认选中 e1
const htmlA = await renderStudio(
  storageSeed([e1(['a3', 'a1']), e2(['a2', 'a4'])]),
);

// 1) 顺序指纹在工作面、详情、导览、导出四处一致出现
const fpA = 'a3›a1';
const fpCountA = htmlA.split(fpA).length - 1;
assert.ok(fpCountA >= 4, `顺序指纹应至少在 4 个入口出现，实际 ${fpCountA}`);

// 2) 数量来自同一份数据
assert.ok(htmlA.includes('已编排 2 件'), '工作面数量应为 2');
assert.ok(htmlA.includes('手的回声（2 件）'), '详情数量应为 2');

// 3) 网格里已编排作品按 pieces 顺序置顶：a3 卡片排在 a1 之前
assert.ok(
  htmlA.indexOf('未完成的圆') < htmlA.indexOf('潮汐之后'),
  '网格中 a3 应排在 a1 前（按 pieces 顺序而非档案顺序）',
);
assert.ok(htmlA.includes('⋮⋮ 1'), '第 1 位作品应显示顺序徽标');
assert.ok(htmlA.includes('⋮⋮ 2'), '第 2 位作品应显示顺序徽标');

// 4) 详情 / 导览站点顺序
const guide1 = htmlA.indexOf('第 1 站');
const guide2 = htmlA.indexOf('第 2 站');
assert.ok(guide1 > -1 && guide2 > guide1, '导览应有两站且顺序正确');
assert.ok(
  htmlA.slice(guide1, guide2).includes('未完成的圆'),
  '导览第 1 站应为 a3',
);

// 5) 导出 JSON 与各入口同序同量（SSR 会把内容转义，先解回文本）
const preMatch = htmlA.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
assert.ok(preMatch, '应渲染导出 JSON 区块');
const exportText = preMatch[1]
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');
const exported = JSON.parse(exportText);
assert.equal(exported.id, 'e1');
assert.equal(exported.pieceCount, 2);
assert.equal(exported.orderFingerprint, fpA);
assert.deepEqual(
  exported.pieces.map((p) => [p.order, p.id]),
  [[1, 'a3'], [2, 'a1']],
  '导出顺序必须与 pieces 一致',
);

// 6) 未加入展览的作品不参与排序，显示“加入展览”
assert.ok(htmlA.includes('加入展览'), '未编排作品应显示加入按钮');

// 场景 B：另一进程视角，默认选中 e2（[a2,a4]），与 e1 的顺序互不影响
const htmlB = await renderStudio(
  storageSeed([e2(['a4', 'a2']), e1(['a3', 'a1'])]),
);
assert.ok(htmlB.split('a4›a2').length - 1 >= 4, 'e2 各入口指纹应为 a4›a2');
assert.ok(!htmlB.includes(fpA), 'e2 视图不应读到 e1 的顺序');

console.log('component-render: 网格/详情/导览/导出顺序一致性校验通过');
