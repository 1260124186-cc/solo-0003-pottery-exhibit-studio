// 验证「复制为草稿」工作流：复制内容、数据隔离、命名冲突、失败原子性、刷新恢复。
// 运行：node scripts/verify-duplicate.mjs
import ts from 'typescript';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, rmSync} from 'node:fs';

const root = new URL('../', import.meta.url);
const out = new URL('../node_modules/.tmp/verify-duplicate/', import.meta.url);
rmSync(out, {recursive: true, force: true});
mkdirSync(new URL('./services/', out), {recursive: true});
mkdirSync(new URL('./domain/', out), {recursive: true});

// 服务层是 TS 且带无扩展名导入，这里转译为 Node 可直接运行的 ESM
const compile = (src, dest) => {
  let js = ts.transpileModule(readFileSync(new URL(src, root), 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020},
  }).outputText;
  js = js.replace(/from\s*['"](\.{1,2}\/[^'"]*)['"]/g, (m, p) => (p.endsWith('.js') ? m : `from '${p}.js'`));
  writeFileSync(new URL(dest, out), js);
};
compile('./src/services/exhibitService.ts', './services/exhibitService.js');
compile('./src/domain/seed.ts', './domain/seed.js');

// localStorage 桩：backing 可变，便于模拟刷新后重新读取
const backing = new Map();
globalThis.localStorage = {
  getItem: k => (backing.has(k) ? backing.get(k) : null),
  setItem: (k, v) => void backing.set(k, String(v)),
  removeItem: k => void backing.delete(k),
  clear: () => backing.clear(),
};
const KEY = 'pottery-exhibit-studio-v1';
const freshService = async tag => (await import(new URL(`./services/exhibitService.js?${tag}`, out))).useExhibitService();

const svc = await freshService('session1');
const list = () => svc.state.value.exhibitions;
const byId = id => list().find(e => e.id === id);

// 场景 1：复制为草稿 —— 字段带过去、状态重置、独立编号
const src = byId('e1');
const srcSnapshot = JSON.stringify(src);
const copy = svc.duplicate('e1');
assert.equal(copy.status, '草稿', '副本必须是全新草稿');
assert.notEqual(copy.id, src.id, '副本必须有独立编号');
assert.notEqual(copy.title, src.title, '副本名称必须可区分');
assert.ok(copy.title.includes('副本'), '副本名称默认带副本标记');
assert.equal(copy.subtitle, src.subtitle);
assert.equal(copy.curator, src.curator);
assert.equal(copy.opening, src.opening);
assert.equal(copy.closing, src.closing);
assert.equal(copy.description, src.description);
assert.deepEqual(copy.pieces, src.pieces, '作品编排要带过去');
assert.ok(copy.pieces !== src.pieces, '作品编排必须是独立数组，不能共享引用');
assert.equal(list().length, 3);
console.log('✓ 场景 1：复制为草稿（副标题/策展人/日期/说明/编排带过去，状态重置，独立编号）');

// 场景 2：修改复制品不影响原展览（双向隔离）
svc.togglePiece(copy.id, 'a2');
svc.togglePiece(copy.id, 'a1');
copy.title = '改名后的副本';
assert.deepEqual(byId(copy.id).pieces, ['a3', 'a2']);
assert.deepEqual(byId('e1').pieces, ['a1', 'a3'], '原展览作品编排不能被副本修改影响');
assert.equal(byId('e1').title, '手的回声');
assert.equal(byId('e1').status, '预览中');
svc.togglePiece('e1', 'a4');
assert.deepEqual(byId(copy.id).pieces, ['a3', 'a2'], '原展览的修改也不能影响副本');
svc.togglePiece('e1', 'a4');
assert.equal(JSON.stringify({...byId('e1'), pieces: byId('e1').pieces}), srcSnapshot, '原展览其余字段保持不变');
console.log('✓ 场景 2：修改复制品不影响原展览（pieces 为独立列表，双向隔离）');

// 场景 3：同一次重复复制，名称互不冲突（场景 2 的改名释放了「（副本）」，可被回收，但任何时刻不得撞名）
const names = [svc.duplicate('e1').title, svc.duplicate('e1').title, svc.duplicate('e1').title];
assert.equal(new Set(names).size, names.length, '重复复制的名称不能互相冲突');
assert.deepEqual(names, ['手的回声（副本）', '手的回声（副本 2）', '手的回声（副本 3）']);
assert.ok(!list().some(e => e.title === '改名后的副本' && names.includes(e.title)));
const copyOfCopy = svc.duplicate(copy.id);
assert.ok(!list().some(e => e.id !== copyOfCopy.id && e.title === copyOfCopy.title), '复制副本也不能撞名');
const ids = list().map(e => e.id);
assert.equal(new Set(ids).size, ids.length, '所有展览编号必须唯一');
console.log(`✓ 场景 3：重复复制名称互不冲突（${names.join(' / ')}）`);

// 场景 4：过长名称截断到合理长度
const long = svc.create('泥土与火焰在漫长岁月中相互成就的当代陶艺叙事篇章伟大展览暨国际巡回特别企划之手工拉坯柴烧盐釉专题文献回顾展');
assert.ok(long.title.length > 40, '源名称应确实超长');
const longCopy = svc.duplicate(long.id);
assert.ok(longCopy.title.length <= 40, `截断后长度 ${longCopy.title.length} 应 ≤ 40`);
assert.ok(longCopy.title.endsWith('（副本）'), '截断后仍保留副本标记');
assert.ok(longCopy.title.length < long.title.length + 5, '确实发生了截断');
const longCopy2 = svc.duplicate(long.id);
assert.ok(longCopy2.title.endsWith('（副本 2）') && longCopy2.title.length <= 40, '超长名称重复复制也各自唯一且不超长');
console.log(`✓ 场景 4：过长名称截断（"${longCopy.title}"，${longCopy.title.length} 字）`);

// 场景 5：复制失败时原展览保持不变
const beforeFail = JSON.stringify(list());
assert.throws(() => svc.duplicate('不存在的编号'), /未找到要复制的展览/);
assert.equal(JSON.stringify(list()), beforeFail, '找不到源展览时状态不变');
const realSet = localStorage.setItem;
localStorage.setItem = () => { throw new Error('QuotaExceeded'); };
assert.throws(() => svc.duplicate('e1'), /复制失败/);
assert.equal(JSON.stringify(list()), beforeFail, '持久化失败时回滚，原展览不变');
localStorage.setItem = realSet;
console.log('✓ 场景 5：复制失败时原展览保持不变（源不存在 / 持久化失败回滚）');

// 场景 6：刷新后两份数据各自正确（重新加载模块 = 刷新页面）
const persisted = JSON.parse(backing.get(KEY));
const svc2 = await freshService('session2-after-reload');
const rList = svc2.state.value.exhibitions;
assert.deepEqual(JSON.parse(JSON.stringify(rList)), persisted.exhibitions, '刷新后状态应与持久化内容一致');
const rSrc = rList.find(e => e.id === 'e1');
const rCopy = rList.find(e => e.id === copy.id);
assert.ok(rSrc && rCopy, '列表中两份数据都在');
assert.equal(rSrc.title, '手的回声');
assert.equal(rSrc.status, '预览中');
assert.deepEqual(rSrc.pieces, ['a1', 'a3']);
assert.equal(rCopy.status, '草稿');
assert.equal(rCopy.subtitle, rSrc.subtitle);
assert.equal(rCopy.curator, rSrc.curator);
assert.equal(rCopy.opening, rSrc.opening);
assert.equal(rCopy.closing, rSrc.closing);
assert.equal(rCopy.description, rSrc.description);
assert.deepEqual(rCopy.pieces, ['a3', 'a2'], '刷新后副本保留自己的修改');
assert.notEqual(rCopy.id, rSrc.id);
assert.equal(rList.filter(e => e.id === copy.id).length, 1, '详情按编号各自可取');
console.log('✓ 场景 6：刷新恢复后原展览与副本在列表/详情中各自正确');

console.log('\n全部 6 个场景通过。');
