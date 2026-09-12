/**
 * 回归验证：真实 StudioView.vue 在缺少 pieces 的旧持久化数据下仍可渲染。
 *
 * 由 scripts/run-ts.mjs --vue 经 rolldown + @vitejs/plugin-vue 打包执行。
 *
 * 覆盖：
 *  - 侧栏列表 e.pieces.length（缺 pieces / pieces=null / 非数组）不再抛错，显示 0 件
 *  - 作品网格 includes 访问不再抛错，全部显示“加入展览”
 *  - useExhibitionFlow 汇总计数只统计有效作品
 *  - 完成度面板在旧数据下指出“至少编排一件作品”，且渲染不修改数据/状态
 *  - togglePiece 对缺 pieces 的旧记录不崩并自愈写回
 *  - 与上线校验仍一致（不可上线被拒绝、状态不变）
 *  - 数据 JSON 往返（模拟刷新）后渲染一致
 */
import assert from 'node:assert/strict';
import { h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import StudioView from '../src/views/StudioView.vue';
import { useExhibitService } from '../src/services/exhibitService';
import { useExhibitionFlow } from '../src/composables/useExhibitionFlow';
import { evaluateExhibition, piecesOf } from '../src/domain/readiness';
import type { Exhibition } from '../src/domain/models';

const svc = useExhibitService();
const flow = useExhibitionFlow();

function partialLegacyNoPieces(): Record<string, unknown> {
  // 模拟旧版本持久化记录：压根没有 pieces 字段；导览/空间也还没有
  return {
    id: 'legacy-none',
    title: '旧展·无 pieces 字段',
    subtitle: '来自上一版本的持久化数据',
    curator: '老策展',
    status: '草稿',
    opening: '2024-01-01',
    closing: '2024-02-01',
    description: '基础信息齐全，但作品字段缺失。',
  };
}

function corruptedLegacy(): Record<string, unknown> {
  // 损坏/非数组形态：null、字符串、数字数组，都必须兜底为空
  return {
    id: 'legacy-bad',
    title: '旧展·pieces 损坏',
    subtitle: 'null 与非法数组',
    curator: '老策展',
    status: '预览中',
    opening: '2024-01-01',
    closing: '2024-02-01',
    description: 'pieces 为 null。',
    pieces: null,
  };
}

function readyExhibition(): Exhibition {
  return {
    id: 'new-ok',
    title: '新展·完整',
    subtitle: '数据规范',
    curator: '新策展',
    status: '草稿',
    opening: '2026-03-01',
    closing: '2026-05-01',
    pieces: ['a1', 'a2'],
    description: '齐全',
    guide: '导览',
  };
}

const legacy = partialLegacyNoPieces();
const corrupted = corruptedLegacy();
const ready = readyExhibition();
svc.state.value.exhibitions = [
  legacy,
  corrupted,
  ready,
] as unknown as Exhibition[];

console.log('回归：缺 pieces 的旧数据不报错');

assert.deepEqual(piecesOf(legacy as Partial<Exhibition>), [], '缺 pieces → 兜底 []');
assert.deepEqual(piecesOf(corrupted as Partial<Exhibition>), [], 'pieces=null → 兜底 []');
assert.deepEqual(piecesOf({ pieces: 'a1' } as unknown as Partial<Exhibition>), [], 'pieces 为字符串 → 兜底 []');
assert.deepEqual(piecesOf({ pieces: [1, 2, 'a1', '  '] } as unknown as Partial<Exhibition>), ['a1'], '非字符串/空白项被过滤');
assert.deepEqual(piecesOf(null), []);
console.log('  ✓ piecesOf 对缺失/损坏形态全部兜底');

assert.equal(flow.totalPieces.value, 2, '汇总计数只统计有效作品（a1、a2）');
console.log('  ✓ 汇总计数 totalPieces = 2，不抛错');

// StudioView setup 时默认选中第一条（缺 pieces 的旧记录）
const html = await renderToString(h(StudioView));
console.log('  ✓ 真实 StudioView 在缺 pieces 数据下 SSR 渲染成功');

assert.ok(html.includes('旧展·无 pieces 字段'));
assert.ok(html.includes('旧展·pieces 损坏'));
// 侧栏三条记录的作品数：两个 0 件、一个 2 件
const zeroCount = (html.match(/0 件/g) ?? []).length;
assert.ok(zeroCount >= 2, `两条缺/损坏 pieces 的侧栏记录都应显示 0 件，实际 ${zeroCount}`);
assert.ok(html.includes('2 件'), '完整展览侧栏显示 2 件');
console.log('  ✓ 侧栏列表对缺 pieces 记录显示“0 件”');

// 作品网格：当前选中的旧记录无作品，四个作品按钮都应是“加入展览”
assert.ok(!html.includes('已编排'), '缺 pieces 时网格不应出现已编排状态');
const joinCount = (html.match(/加入展览/g) ?? []).length;
assert.equal(joinCount, 4, `四个作品都应可加入，实际 ${joinCount}`);
console.log('  ✓ 作品网格 includes 访问不崩，全部显示“加入展览”');

// 完成度面板：partial，明确指出缺作品（与上线规则同源）
assert.ok(html.includes('尚未完成'), '面板应判为尚未完成');
assert.ok(html.includes('至少编排一件作品后才能上线'), '面板应明确指出缺作品');
console.log('  ✓ 面板指出缺项：至少编排一件作品');

// 渲染不得修改/自愈任何字段，更不能改变状态
assert.equal('pieces' in legacy, false, '渲染后原始旧记录仍不应出现 pieces 字段（纯呈现）');
assert.equal(legacy.status, '草稿');
assert.equal(corrupted.status, '预览中');
console.log('  ✓ 渲染未修改数据，状态不变');

console.log('回归：刷新一致 + 操作兜底 + 上线不矛盾');

// 模拟刷新：JSON 往返后再渲染，结果一致
const reloaded = JSON.parse(JSON.stringify(svc.state.value.exhibitions)) as Exhibition[];
svc.state.value.exhibitions = reloaded;
const html2 = await renderToString(h(StudioView));
assert.equal(html2, html, 'JSON 持久化往返（刷新）后渲染必须一致');
console.log('  ✓ 刷新持久化往返后渲染一致');

// togglePiece 对缺 pieces 的旧记录不崩，并把规范化数组写回
const legacyReloaded = svc.state.value.exhibitions[0];
assert.equal('pieces' in legacyReloaded, false);
svc.togglePiece('legacy-none', 'a1');
assert.deepEqual(piecesOf(legacyReloaded), ['a1'], '加入作品后兜底写回');
assert.equal(legacyReloaded.status, '草稿', '编排作品不改变状态');
const html3 = await renderToString(h(StudioView));
assert.ok(html3.includes('已编排'), '再次渲染应出现已编排状态');
svc.togglePiece('legacy-none', 'a1');
assert.deepEqual(piecesOf(legacyReloaded), [], '再次点击可取消');
console.log('  ✓ togglePiece 对缺 pieces 旧记录不崩并自愈，状态不变');

// 损坏记录上的操作同样不崩
assert.doesNotThrow(() => svc.togglePiece('legacy-bad', 'a2'));
assert.deepEqual(piecesOf(svc.state.value.exhibitions.find((e) => e.id === 'legacy-bad')), ['a2']);
console.log('  ✓ togglePiece 对 pieces=null 的损坏记录不崩');

// 与上线校验一致：缺作品（及导览）时拒绝且状态不变
const target = svc.state.value.exhibitions.find((e) => e.id === 'legacy-none')!;
const r = evaluateExhibition(target);
assert.equal(r.canRelease, false);
assert.throws(
  () => svc.release('legacy-none'),
  (err: Error) => err.message === r.blockers[0],
  '拒绝原因必须与面板首个缺项一致',
);
assert.equal(target.status, '草稿', '被上线拒绝后状态不变');
console.log('  ✓ 缺 pieces 时上线动作与面板一致地拒绝，状态不变');

console.log('回归：空展览形态在真实视图中也可渲染');

svc.state.value.exhibitions = [{ id: 'empty1' } as unknown as Exhibition];
const htmlEmpty = await renderToString(h(StudioView));
assert.ok(htmlEmpty.includes('空展览'));
assert.ok(htmlEmpty.includes('未命名展览'));
assert.ok(htmlEmpty.includes('0 件'));
console.log('  ✓ 空对象展览渲染为空展览，不报错');

console.log('\nStudioView 旧数据回归验证全部通过 ✓');
