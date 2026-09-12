/**
 * 展览完成度验证（由 scripts/verify-readiness.mjs 经 esbuild 打包后执行）。
 *
 * 覆盖：
 *  1. 不同完整度（空 / 部分 / 可上线）的面板判定是否正确、缺项是否被明确指出
 *  2. 确定性：同一份数据重复计算、序列化“刷新”后结果一致
 *  3. 纯函数不修改数据；面板判定不改变任何展览状态
 *  4. 与上线校验不矛盾：对每个用例和大量随机用例，面板 canRelease 与真实 release() 放行/拒绝完全一致
 *  5. updateInfo 白名单无法修改 status
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateExhibition, releaseDecision } from '../src/domain/readiness';
import { useExhibitService } from '../src/services/exhibitService';
import { exhibitions as seedExhibitions } from '../src/domain/seed';
import type { Exhibition } from '../src/domain/models';

// 打包后从临时文件执行，根目录由 runner 通过环境变量注入
const root = process.env.READINESS_ROOT ?? process.cwd();
let passed = 0;
function ok(name: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

function fullExhibition(over: Partial<Exhibition> = {}): Exhibition {
  return {
    id: 'x',
    title: '完整的展',
    subtitle: '副标题',
    curator: '策展人',
    status: '草稿',
    opening: '2026-03-01',
    closing: '2026-05-01',
    pieces: ['a1'],
    description: '说明',
    guide: '导览',
    venue: '一号厅',
    ...over,
  };
}

console.log('1) 不同完整度的面板显示');

ok('null / undefined 不报错，判为空展览', () => {
  for (const v of [null, undefined]) {
    const r = evaluateExhibition(v);
    assert.equal(r.state, 'empty');
    assert.equal(r.canRelease, false);
    assert.ok(r.blockers.length > 0);
  }
});

ok('空对象 {} 判为空展览，且列出缺失项', () => {
  const r = evaluateExhibition({});
  assert.equal(r.state, 'empty');
  assert.ok(r.blockers.includes('缺少展览名称'));
  assert.ok(r.blockers.includes('至少编排一件作品后才能上线'));
  assert.equal(r.passedChecks, 0);
});

ok('只有名称的新草稿判为空展览', () => {
  const r = evaluateExhibition({ title: '只有名字' });
  assert.equal(r.state, 'empty');
  assert.equal(r.canRelease, false);
});

ok('有作品、基础信息齐，但缺导览/空间 → partial，明确指出缺哪一项', () => {
  const r = evaluateExhibition(fullExhibition({ guide: undefined, venue: undefined }));
  assert.equal(r.state, 'partial');
  assert.equal(r.canRelease, false);
  assert.deepEqual(r.blockers, ['需要补充导览说明或展览空间信息（至少一项）']);
  const gc = r.groups.find((g) => g.id === 'guide')!.checks[0];
  assert.equal(gc.status, 'missing');
});

ok('仅有导览 或 仅有空间信息，都算导览/空间项通过', () => {
  assert.equal(evaluateExhibition(fullExhibition({ venue: '' })).canRelease, true);
  assert.equal(evaluateExhibition(fullExhibition({ guide: '' })).canRelease, true);
});

ok('缺一件作品但其余齐备 → partial，原因是作品项（保持原上线工作流规则）', () => {
  const r = evaluateExhibition(fullExhibition({ pieces: [] }));
  assert.equal(r.state, 'partial');
  assert.equal(r.blockers[0], '至少编排一件作品后才能上线');
});

ok('作品 id 为空白字符串不计入作品数', () => {
  const r = evaluateExhibition(fullExhibition({ pieces: ['  ', ''] }));
  assert.equal(r.canRelease, false);
  assert.ok(r.blockers.includes('至少编排一件作品后才能上线'));
});

ok('空白字符串字段视为缺失，不报错', () => {
  const r = evaluateExhibition(
    fullExhibition({ title: '   ', subtitle: '', curator: '\t', description: '\n', opening: '', closing: '' }),
  );
  assert.equal(r.canRelease, false);
  assert.ok(r.blockers.includes('缺少展览名称'));
  assert.ok(r.blockers.includes('缺少有效的开展/闭幕日期'));
});

ok('日期缺失 / 非法 / 闭幕早于开展 都被指出', () => {
  assert.ok(
    evaluateExhibition(fullExhibition({ opening: '2026-13-01' })).blockers.includes(
      '缺少有效的开展/闭幕日期',
    ),
  );
  assert.ok(
    evaluateExhibition(fullExhibition({ opening: '2026-02-30' })).blockers.includes(
      '缺少有效的开展/闭幕日期',
    ),
  );
  assert.ok(
    evaluateExhibition(fullExhibition({ opening: '2026-05-02', closing: '2026-05-01' })).blockers.includes(
      '闭幕日期不能早于开展日期',
    ),
  );
});

ok('全部齐备 → ready，100%，无 blocker，summary 表示可上线', () => {
  const r = evaluateExhibition(fullExhibition());
  assert.equal(r.state, 'ready');
  assert.equal(r.canRelease, true);
  assert.equal(r.percent, 100);
  assert.deepEqual(r.blockers, []);
  assert.match(r.summary, /可以上线/);
  assert.ok(r.groups.every((g) => g.pass));
});

ok('种子数据：e1 可上线、e2 缺导览/空间、e3 空展览', () => {
  const [e1, e2, e3] = seedExhibitions;
  assert.equal(evaluateExhibition(e1).state, 'ready');
  assert.equal(evaluateExhibition(e2).state, 'partial');
  assert.deepEqual(evaluateExhibition(e2).blockers, ['需要补充导览说明或展览空间信息（至少一项）']);
  assert.equal(evaluateExhibition(e3).state, 'empty');
});

console.log('2) 确定性：重复计算与“刷新”后一致');

ok('同一份数据计算 50 次结果完全相同', () => {
  const e = fullExhibition({ guide: undefined });
  const first = JSON.stringify(evaluateExhibition(e));
  for (let i = 0; i < 50; i++) {
    assert.equal(JSON.stringify(evaluateExhibition(e)), first);
  }
});

ok('JSON 序列化再解析（模拟刷新持久化）结果一致', () => {
  const e = fullExhibition({ pieces: ['a1', 'a2'], guide: '' });
  const before = evaluateExhibition(e);
  const reloaded = JSON.parse(JSON.stringify(e)) as Exhibition;
  const after = evaluateExhibition(reloaded);
  assert.deepEqual(JSON.parse(JSON.stringify(after)), JSON.parse(JSON.stringify(before)));
});

ok('检查项与 blocker 顺序固定', () => {
  const r = evaluateExhibition({});
  assert.deepEqual(
    r.checks.map((c) => c.id),
    ['title', 'subtitle', 'curator', 'dates', 'description', 'hasPiece', 'guideOrVenue'],
  );
});

console.log('3) 不修改数据 / 不改变展览状态');

ok('evaluateExhibition 是纯函数，入参不被修改', () => {
  const e = fullExhibition({ guide: undefined });
  const snapshot = JSON.stringify(e);
  evaluateExhibition(e);
  evaluateExhibition(null);
  evaluateExhibition(undefined);
  assert.equal(JSON.stringify(e), snapshot);
});

const svc = useExhibitService();

ok('反复计算完成度不改变 service 中的展览与状态', () => {
  svc.state.value.exhibitions = [fullExhibition({ id: 'p1', status: '草稿' })];
  const snapshot = JSON.stringify(svc.state.value.exhibitions);
  for (let i = 0; i < 20; i++) evaluateExhibition(svc.state.value.exhibitions[0]);
  assert.equal(JSON.stringify(svc.state.value.exhibitions), snapshot);
  assert.equal(svc.state.value.exhibitions[0].status, '草稿');
});

ok('updateInfo 只改白名单字段，无法借面板修改 status', () => {
  svc.state.value.exhibitions = [fullExhibition({ id: 'p2', status: '草稿' })];
  svc.updateInfo('p2', { title: '新标题', guide: '新增导览' });
  const e = svc.state.value.exhibitions[0];
  assert.equal(e.title, '新标题');
  assert.equal(e.guide, '新增导览');
  assert.equal(e.status, '草稿');
  // 运行时即便塞入 status 键，也必须被白名单忽略
  svc.updateInfo('p2', { title: 'x' } as never);
  (svc.updateInfo as (id: string, patch: Record<string, unknown>) => void)('p2', {
    status: '已上线',
  });
  assert.equal(svc.state.value.exhibitions[0].status, '草稿');
});

console.log('4) 面板结论与真实上线动作对拍（不允许矛盾）');

/**
 * 核心不变式：对同一展览，
 *   面板 canRelease === true  ⇔ release() 成功并转为“已上线”
 *   面板 canRelease === false ⇔ release() 抛错且状态不变，错误信息 = blockers[0]
 */
function parity(e: Exhibition): void {
  const r = evaluateExhibition(e);
  const decision = releaseDecision(e);
  assert.equal(decision.canRelease, r.canRelease, 'releaseDecision 必须与面板同源');
  assert.deepEqual(decision.blockers, r.blockers);
  const before = e.status;
  let threw: unknown = null;
  try {
    svc.release(e.id);
  } catch (err) {
    threw = err;
  }
  if (r.canRelease) {
    assert.equal(threw, null, '面板说可上线，release 不允许拒绝');
    assert.equal(svc.state.value.exhibitions[0].status, '已上线', '放行后状态转为已上线');
  } else {
    assert.ok(threw instanceof Error, '面板说不可上线，release 不允许放行');
    assert.equal(
      (threw as Error).message,
      r.blockers[0],
      '拒绝原因必须与面板指出的第一个缺项一致',
    );
    assert.equal(svc.state.value.exhibitions[0].status, before, '被拒绝时状态不得改变');
  }
}

ok('固定用例逐一通过对拍', () => {
  const cases: Exhibition[] = [
    fullExhibition({ id: 'c1' }),
    fullExhibition({ id: 'c2', guide: '', venue: '' }),
    fullExhibition({ id: 'c3', pieces: [] }),
    fullExhibition({ id: 'c4', title: '', pieces: [] }),
    fullExhibition({ id: 'c5', opening: '2026-05-02', closing: '2026-05-01' }),
    { id: 'c6', title: '空', status: '草稿' } as Exhibition,
  ];
  for (const c of cases) {
    svc.state.value.exhibitions = [structuredClone(c)];
    parity(svc.state.value.exhibitions[0]);
  }
});

ok('300 个随机残缺用例，面板与 release 结论全部一致', () => {
  const strings = ['完整值', '', '   ', undefined as unknown as string];
  for (let i = 0; i < 300; i++) {
    const pick = () => strings[Math.floor(Math.random() * strings.length)];
    const piecePool = Math.random() < 0.4 ? [] : Math.random() < 0.5 ? ['a1'] : ['', 'a2', ' '];
    const e: Exhibition = {
      id: 'rand' + i,
      title: pick(),
      subtitle: pick(),
      curator: pick(),
      status: '草稿',
      opening: Math.random() < 0.6 ? '2026-01-01' : pick(),
      closing: Math.random() < 0.6 ? '2026-02-01' : pick(),
      pieces: piecePool,
      description: pick(),
      guide: pick(),
      venue: pick(),
    };
    svc.state.value.exhibitions = [e];
    parity(e);
  }
});

ok('结构性守卫：release 必须来自共享规则，视图必须消费同一规则', () => {
  const svcSrc = readFileSync(resolve(root, 'src/services/exhibitService.ts'), 'utf8');
  const viewSrc = readFileSync(resolve(root, 'src/views/StudioView.vue'), 'utf8');
  assert.match(svcSrc, /releaseDecision/, 'release() 必须调用共享的 releaseDecision');
  assert.doesNotMatch(
    svcSrc,
    /!e\.pieces\.length|pieces\.length\s*===?\s*0/,
    '不允许在 release 里另写 pieces 校验，规则只能存在于 readiness.ts',
  );
  assert.match(viewSrc, /evaluateExhibition/, '面板必须使用 evaluateExhibition');
  assert.doesNotMatch(viewSrc, /\.\s*status\s*=(?!=)/, '面板代码不允许对 status 赋值');
  assert.doesNotMatch(
    viewSrc,
    /['"]status['"]\s*:/,
    '面板代码不允许通过对象补丁携带 status',
  );
});

console.log(`\n全部通过：${passed} 项检查 ✓`);
