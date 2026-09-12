/* 验证脚本：用合法文件与不完整文件各导入一次，检查部分成功、冲突跳过与持久化。
 * 运行：node scripts/verify-import.mjs
 */
import { rolldown } from 'rolldown';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// 内存版 localStorage，验证跨刷新保留
function makeStore(initial = {}) {
  let data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    _snapshot: () => JSON.parse(JSON.stringify(data)),
    _reload: () => {
      // 模拟“刷新”：state 单例销毁重建，数据仍从 localStorage 恢复
      const frozen = JSON.parse(JSON.stringify(data));
      data = frozen;
    },
  };
}

const store = makeStore();
globalThis.localStorage = store;

let loadSeq = 0;
async function loadService() {
  const bundle = await rolldown({
    input: join(root, 'src/services/exhibitService.ts'),
  });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  // 追加唯一注释，保证每次加载都是新的模块实例（模拟页面刷新重建单例）
  const code = output[0].code + `\n;/*load:${loadSeq++}*/`;
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  const mod = await import(url);
  return mod.useExhibitService();
}

let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✕ ${msg}`);
    failures++;
  }
}
const failureReason = (r, kind, fragment) =>
  r.failures.find((f) => f.kind === kind && f.reason.includes(fragment));

// ---------- 场景一：合法文件 ----------
console.log('\n[场景一] 导入合法文件 import-valid.json');
{
  const svc = await loadService();
  const before = { ex: svc.state.value.exhibitions.length, art: svc.state.value.artworks.length };
  const text = readFileSync(join(root, 'fixtures/import-valid.json'), 'utf8');
  const r = svc.importText(text);

  assert(r.ok === true, '文件级结果为成功');
  assert(r.failures.length === 0, `无失败记录（实际 ${r.failures.length}）`);
  assert(r.successes.length === 4, `成功 4 条（实际 ${r.successes.length}）`);
  assert(
    svc.state.value.artworks.length === before.art + 2 &&
      svc.state.value.exhibitions.length === before.ex + 2,
    'state 中立即可见新增的 2 件作品与 2 场展览',
  );
  const e = svc.state.value.exhibitions.find((x) => x.id === 'e-import-01');
  assert(
    !!e && e.pieces.join() === 'a-import-01,a-import-02' && e.status === '草稿',
    '展览 e-import-01 字段与 pieces 关联正确',
  );

  // 模拟刷新：单例重建后从 localStorage 恢复
  store._reload();
  const reloaded = await loadService();
  const persisted = JSON.parse(store.getItem('pottery-exhibit-studio-v1'));
  assert(
    !!persisted.exhibitions.find((x) => x.id === 'e-import-02') &&
      !!persisted.artworks.find((x) => x.id === 'a-import-02') &&
      !!reloaded.state.value.exhibitions.find((x) => x.id === 'e-import-02'),
    '刷新后（重新从 localStorage 加载）数据仍保留',
  );

  // 同文件再导一次：全部冲突，现有数据不被覆盖
  const again = svc.importText(text);
  assert(again.successes.length === 0, '重复导入同一文件时 0 条成功');
  assert(
    failureReason(again, '展览', '编号 e-import-01 已被现有展览') &&
      failureReason(again, '展览', '重名') &&
      failureReason(again, '作品', '作品编号 a-import-01 已被现有作品'),
    '重复编号与重名均有明确提示且跳过',
  );
  const existing = svc.state.value.exhibitions.find((x) => x.id === 'e-import-01');
  assert(existing.curator === '许南', '已有展览内容未被覆盖（curator 仍为原值）');
  assert(
    svc.state.value.exhibitions.length === before.ex + 2 &&
      svc.state.value.artworks.length === before.art + 2,
    '冲突跳过后计数不变，无静默写入',
  );
}

// ---------- 场景二：不完整/混合文件（全新存储，模拟用户再次使用） ----------
console.log('\n[场景二] 导入不完整文件 import-partial.json');
{
  // 新存储（仅种子数据）
  const freshStore = makeStore();
  globalThis.localStorage = freshStore;
  const svc = await loadService();
  const before = { ex: svc.state.value.exhibitions.length, art: svc.state.value.artworks.length };

  const text = readFileSync(join(root, 'fixtures/import-partial.json'), 'utf8');
  const r = svc.importText(text);

  assert(r.ok === true, '文件本身可解析，按逐条结果处理（不是整批失败）');
  assert(r.successes.length === 3, `合法部分生效：3 条成功（实际 ${r.successes.length}）`);
  assert(r.failures.length === 6, `非法部分逐条列出：6 条失败（实际 ${r.failures.length}）`);

  assert(
    svc.state.value.exhibitions.some((x) => x.id === 'e-import-good-02') &&
      svc.state.value.artworks.some((x) => x.id === 'a-import-12'),
    '合法展览 e-import-good-02 与作品 a-import-12 已写入并立即可见',
  );
  assert(
    svc.state.value.exhibitions.find((x) => x.id === 'e-import-good-02').pieces.join() ===
      'a-import-12,a1',
    '成功展览的 pieces 同时包含新作品与既有作品（去重后）',
  );

  // 五条失败各自原因
  assert(
    failureReason(r, '展览', '缺少字段 title') &&
      failureReason(r, '展览', '缺少字段 status') &&
      failureReason(r, '展览', '缺少字段 opening'),
    '缺字段：提示具体缺失的字段名',
  );
  assert(
    failureReason(r, '展览', 'a-ghost') && failureReason(r, '展览', 'opening 不能晚于 closing'),
    '引用不存在作品 + 日期倒置：分别给出原因',
  );
  assert(
    failureReason(r, '展览', '展览编号 e1 已被现有展览'),
    '与现有展览编号冲突：明确提示并跳过',
  );
  assert(
    failureReason(r, '作品', '字段 year 类型错误') && failureReason(r, '作品', '字段 note 类型错误'),
    '类型错误：指出字段与实际类型',
  );
  assert(
    failureReason(r, '作品', '作品编号 a1 已被现有作品'),
    '与现有作品编号冲突：明确提示并跳过',
  );
  assert(failureReason(r, '作品', '字段 id 不能为空'), 'id 为空：提示字段不能为空');

  assert(
    !svc.state.value.exhibitions.some((x) => x.id === 'e-bad-missing') &&
      !svc.state.value.exhibitions.some((x) => x.id === 'e-bad-ref') &&
      !svc.state.value.artworks.some((x) => x.id === 'a-bad-type'),
    '非法记录均未写入 state，现有数据未被破坏',
  );
  assert(
    svc.state.value.exhibitions.length === before.ex + 1 &&
      svc.state.value.artworks.length === before.art + 2,
    '只新增合法记录（展览 +1、作品 +2），计数与逐批结果一致',
  );
  const seed = svc.state.value.exhibitions.find((x) => x.id === 'e1');
  assert(seed.title === '手的回声', '种子展览 e1 未被冲突记录覆盖');

  freshStore._reload();
  const persisted = JSON.parse(freshStore.getItem('pottery-exhibit-studio-v1'));
  assert(
    persisted.exhibitions.some((x) => x.id === 'e-import-good-02') &&
      !persisted.exhibitions.some((x) => x.id === 'e-bad-missing'),
    '刷新后合法记录保留、非法记录仍不存在',
  );
}

// ---------- 场景三：文件级错误（顺手验证不会动现有数据） ----------
console.log('\n[场景三] 文件级错误');
{
  const freshStore = makeStore();
  globalThis.localStorage = freshStore;
  const svc = await loadService();
  const count = svc.state.value.exhibitions.length + svc.state.value.artworks.length;

  for (const [name, bad] of [
    ['非法 JSON', '{ exhibitions: ['],
    ['顶层缺数组', JSON.stringify({ exhibitions: [] })],
    ['类型错误', JSON.stringify({ exhibitions: {}, artworks: [] })],
  ]) {
    const r = svc.importText(bad);
    assert(!r.ok && r.failures[0]?.kind === '文件' && r.reason.length > 0, `${name}：ok=false 且给出文件级原因`);
  }
  assert(
    svc.state.value.exhibitions.length + svc.state.value.artworks.length === count,
    '文件级失败后现有数据完全不变',
  );
}

console.log(failures === 0 ? '\n全部验证通过 ✅\n' : `\n有 ${failures} 项验证失败 ❌\n`);
process.exit(failures === 0 ? 0 : 1);
