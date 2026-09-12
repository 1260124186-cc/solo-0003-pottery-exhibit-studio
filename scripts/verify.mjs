// 验证：编辑展览信息的全部业务规则。通过 vite 的 SSR 加载 TS 源码，
// 注入 localStorage shim；refresh 模式用全新模块图模拟页面刷新后的持久化恢复。
import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const refresh = process.argv.includes('--refresh');
const storageFile = path.join(os.tmpdir(), 'pottery-studio-verify.json');

function makeStorage() {
  // 文件存储：第二次运行用全新模块图读取它，等价于刷新页面后从 localStorage 恢复
  const read = () => (fs.existsSync(storageFile) ? JSON.parse(fs.readFileSync(storageFile, 'utf8')) : {});
  const write = (data) => fs.writeFileSync(storageFile, JSON.stringify(data));
  let shouldFail = false;
  return {
    getItem: (k) => (k in read() ? read()[k] : null),
    setItem: (k, v) => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error('QuotaExceededError');
      }
      const data = read();
      data[k] = String(v);
      write(data);
    },
    removeItem: (k) => {
      const data = read();
      delete data[k];
      write(data);
    },
    dump: () => {
      const raw = read()['pottery-exhibit-studio-v1'];
      return raw ? JSON.parse(raw) : null;
    },
    failOnce() {
      shouldFail = true;
    }
  };
}

let passed = 0;
function ok(name, cond) {
  if (!cond) throw new Error('FAIL: ' + name);
  console.log('  ✓ ' + name);
  passed++;
}
function expectThrow(fn, msgIncludes, name) {
  try {
    fn();
  } catch (e) {
    if (msgIncludes && !String(e.message).includes(msgIncludes)) {
      throw new Error(`FAIL: ${name}（提示不含“${msgIncludes}”，实际：${e.message}）`);
    }
    console.log('  ✓ ' + name + `（提示：${e.message}）`);
    passed++;
    return;
  }
  throw new Error('FAIL: ' + name + '（应当抛错但没有）');
}

const vite = await createServer({
  server: { middlewareMode: true },
  logLevel: 'silent',
  configFile: path.resolve('vite.config.ts'),
  appType: 'custom'
});

async function load() {
  const url = pathToFileURL(path.resolve('src/services/exhibitService.ts')).href;
  return await vite.ssrLoadModule(url);
}

// 页面刷新后：从持久化数据恢复。非 refresh 模式清掉旧存档从头开始；
// refresh 模式由独立子进程运行，拥有全新模块图，但读取同一份“localStorage”文件。
if (!refresh && fs.existsSync(storageFile)) fs.rmSync(storageFile);
globalThis.localStorage = makeStorage();

if (refresh) {
  const { useExhibitService } = await load();
  const { state } = useExhibitService();
  const e = state.value.exhibitions.find((x) => x.id === 'e1');
  console.log('【刷新恢复】');
  ok('刷新后恢复编辑后的副标题', e.subtitle === '刷新后的副标题');
  ok('刷新后恢复编辑后的策展人', e.curator === '新策展人');
  ok('刷新后恢复编辑后的日期', e.opening === '2026-02-01' && e.closing === '2026-05-01');
  ok('刷新后恢复编辑后的说明', e.description === '刷新后仍可见的说明');
  ok('刷新后作品编排未受影响', JSON.stringify(e.pieces) === JSON.stringify(['a1', 'a3']));
  const e2 = state.value.exhibitions.find((x) => x.id === 'e2');
  ok('刷新后其他展览信息未被改动', e2.subtitle === '器物在光线中改变形状' && e2.curator === '周宁');
} else {
  const { useExhibitService } = await load();
  const { state, create, updateInfo, togglePiece } = useExhibitService();

  const target = () => state.value.exhibitions.find((x) => x.id === 'e1');
  const other = () => state.value.exhibitions.find((x) => x.id === 'e2');
  const original = JSON.stringify(target());

  console.log('【即时生效：列表/详情/导览/分享同源】');
  const info = { subtitle: '泥土的新叙事', curator: '林策', opening: '2026-01-10', closing: '2026-04-20', description: '编辑后的展览说明文本。' };
  updateInfo('e1', info);
  const e = target();
  // 四处展示都直接渲染这个响应式对象，字段一致即四处一致
  for (const f of ['subtitle', 'curator', 'opening', 'closing', 'description']) {
    ok(`保存后字段 ${f} 立即更新（四处展示同源）`, e[f] === info[f]);
  }
  ok('localStorage 已写入新内容', globalThis.localStorage.dump().exhibitions.find((x) => x.id === 'e1').curator === '林策');
  ok('作品编排未被编辑改动', JSON.stringify(e.pieces) === JSON.stringify(['a1', 'a3']));

  console.log('【日期校验】');
  const good = { ...info };
  expectThrow(() => updateInfo('e1', { ...good, closing: '2026-01-09' }), '结束日期不能早于开放日期', '结束日期早于开放日期被拒绝');
  ok('同日开闭日期允许（不早于）', (updateInfo('e1', { ...good, opening: '2026-03-03', closing: '2026-03-03' }), target().closing === '2026-03-03'));
  expectThrow(() => updateInfo('e1', { ...good, opening: '2026-02-30' }), '不是有效的日期', '非法日历日期被拒绝');
  expectThrow(() => updateInfo('e1', { ...good, opening: '2026/01/10' }), 'YYYY-MM-DD', '错误日期格式被拒绝');
  ok('校验失败后仍是上一次保存的值（无半成品写入）', target().opening === '2026-03-03');

  console.log('【必填校验】');
  for (const [k, label] of [['subtitle', '副标题'], ['curator', '策展人'], ['opening', '开放日期'], ['closing', '结束日期'], ['description', '说明']]) {
    expectThrow(() => updateInfo('e1', { ...good, [k]: '   ' }), `${label}不能为空`, `${label}清空被拒绝`);
  }
  ok('全部必填校验失败后原值不变', target().description === good.description && target().curator === '林策');
  ok('必填校验失败时本地存储仍是旧值', globalThis.localStorage.dump().exhibitions.find((x) => x.id === 'e1').opening === '2026-03-03');

  console.log('【原子性：持久化失败不写入一半数据】');
  globalThis.localStorage.failOnce();
  expectThrow(() => updateInfo('e1', { ...good, subtitle: '不应出现的副标题' }), '保存失败', '存储失败向上传播明确提示');
  ok('存储失败后内存数据已回滚（无一半数据）', target().subtitle === '泥土的新叙事');
  ok('存储失败后作品编排仍在', JSON.stringify(target().pieces) === JSON.stringify(['a1', 'a3']));

  console.log('【隔离性】');
  ok('其他展览信息完全不变', other().subtitle === '器物在光线中改变形状' && other().curator === '周宁' && other().opening === '2024-12-01');
  const beforeToggle = JSON.stringify(target().pieces);
  togglePiece('e2', 'a1');
  ok('编辑信息不影响其他展览的作品编排，反之亦然', other().pieces.includes('a1') && JSON.stringify(target().pieces) === beforeToggle);
  togglePiece('e2', 'a1');
  expectThrow(() => updateInfo('nope', good), '找不到该展览', '编辑不存在的展览被拒绝');
  ok('目标展览整体仅五项被改过（其余字段保持）', JSON.stringify({ ...target(), subtitle: '', curator: '', opening: '', closing: '', description: '' })
    === JSON.stringify({ ...JSON.parse(original), subtitle: '', curator: '', opening: '', closing: '', description: '' }));

  console.log('【已上线展览：单一版本，各入口一致】');
  const draft = create('上线一致性测试展');
  updateInfo(draft.id, { subtitle: '上线前副标题', curator: '上线前策展人', opening: '2026-06-01', closing: '2026-07-01', description: '上线前说明' });
  togglePiece(draft.id, 'a2');
  // 模拟“上线”动作（release 同样写同一数据源）
  useExhibitService().release(draft.id);
  const published = () => state.value.exhibitions.filter((x) => x.status === '已上线');
  ok('上线后出现在观众导览（已上线集合）', published().some((x) => x.id === draft.id));
  updateInfo(draft.id, { subtitle: '上线后副标题', curator: '上线后策展人', opening: '2026-08-01', closing: '2026-09-30', description: '上线后说明' });
  const p = state.value.exhibitions.find((x) => x.id === draft.id);
  // 导览/分享从同一 state 取记录；不存在第二个“观众版本”，故四处必然一致
  ok('已上线展览编辑后导览与分享读到同一新值', published().find((x) => x.id === draft.id) === p
    && p.subtitle === '上线后副标题' && p.curator === '上线后策展人'
    && p.opening === '2026-08-01' && p.closing === '2026-09-30' && p.description === '上线后说明');
  ok('已上线展览的作品编排未被编辑改动', JSON.stringify(p.pieces) === JSON.stringify(['a2']));
  ok('持久化中也只有一个版本（无 draft/published 双份）',
    globalThis.localStorage.dump().exhibitions.filter((x) => x.id === draft.id).length === 1
    && globalThis.localStorage.dump().exhibitions.find((x) => x.id === draft.id).subtitle === '上线后副标题');

  // 为第二阶段（--refresh 子进程）准备数据
  updateInfo('e1', { subtitle: '刷新后的副标题', curator: '新策展人', opening: '2026-02-01', closing: '2026-05-01', description: '刷新后仍可见的说明' });
}

await vite.close();
console.log(`\n${passed} 项检查通过`);

if (!refresh) {
  // 模拟页面刷新：独立进程、全新模块图，仅靠 localStorage 恢复
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [path.resolve('scripts/verify.mjs'), '--refresh'], { encoding: 'utf8' });
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log('【刷新恢复】子进程完成：修改在全新页面加载后依然生效');
  fs.rmSync(storageFile, { force: true });
}
