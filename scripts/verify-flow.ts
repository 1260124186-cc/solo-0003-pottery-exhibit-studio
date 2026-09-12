/**
 * 状态流转规则验证脚本（Node 直接运行，无需测试框架）。
 * 用文件模拟 localStorage：父进程操作流转，子进程重新初始化服务，
 * 验证“刷新后”列表/本地存储与内存状态一致。
 */
import './flow-localstorage-shim.ts';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {useExhibitService} from '../src/services/exhibitService.ts';
import * as flow from '../src/domain/flow.ts';

const STORE_FILE = process.env.STORE_FILE!;
const childMode = process.argv[2] === 'reload';

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}`);
  }
}
function throws(fn: () => unknown, fragment: string, label: string) {
  try {
    fn();
    ok(false, `${label}（期望抛出含“${fragment}”的错误）`);
  } catch (e: any) {
    ok(String(e.message).includes(fragment), `${label}（实际：${e.message}）`);
  }
}
function statusOf(svc: ReturnType<typeof useExhibitService>, id: string) {
  return svc.state.value.exhibitions.find((x: any) => x.id === id)!.status;
}
function storedStatus() {
  return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')).exhibitions.find(
    (x: any) => x.id === testId,
  ).status;
}

// ============ 子进程：模拟刷新 ============
if (childMode) {
  const svc = useExhibitService();
  const testId = process.env.TEST_ID!;
  const e = svc.state.value.exhibitions.find((x: any) => x.id === testId)!;
  ok(e.status === '已上线', `刷新后状态仍为「已上线」（实际：${e.status}）`);
  ok(flow.isReady(e), '刷新后完成度与上线状态一致（isReady=true）');
  ok(e.pieces.length >= 1, '刷新后作品列表保持一致');
  console.log(`\n刷新验证：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

// ============ 父进程：全部流转规则 ============
const svc = useExhibitService();
const d = svc.create('测试展');
const testId = d.id;

console.log('\n[1] 初始创建与前置校验');
ok(statusOf(svc, d.id) === '草稿', '新建展览为草稿');
const fresh = svc.state.value.exhibitions.find((x: any) => x.id === d.id)!;
ok(!flow.isReady(fresh), '无作品时完成度不通过');
ok(
  flow.completionChecklist(fresh).filter((i) => !i.ok).length === 1,
  '默认信息下仅缺“至少一件作品”一项',
);

console.log('\n[2] 不满足条件不能前进（作品/信息）');
throws(() => svc.transition(d.id, '预览中'), '条件未满足', '草稿（无作品）→ 预览中 被拒绝');
ok(statusOf(svc, d.id) === '草稿', '失败后保持草稿');
ok(storedStatus() === '草稿', '失败后本地存储仍是草稿');

svc.togglePiece(d.id, 'a1');
ok(flow.isReady(fresh), '加入作品后完成度通过');
svc.updateInfo(d.id, {subtitle: '  '});
ok(!flow.isReady(fresh), '副标题清空后完成度不通过');
throws(() => svc.transition(d.id, '预览中'), '填写展览副标题', '信息不完整 → 预览中 被拒绝');
ok(statusOf(svc, d.id) === '草稿', '失败后仍保持草稿');
svc.updateInfo(d.id, {subtitle: '泥土与时间'});
svc.updateInfo(d.id, {opening: '2025-05-01', closing: '2025-01-01'});
ok(flow.missingConditions(fresh).join('；').includes('展期有效'), '开幕晚于闭幕时展期条件不通过');
throws(() => svc.transition(d.id, '预览中'), '展期有效', '展期无效 → 预览中 被拒绝');
svc.updateInfo(d.id, {opening: '2025-01-01', closing: '2025-03-01'});

svc.updateInfo(d.id, {title: '   '});
ok(!flow.isReady(fresh), '标题清空（纯空白）后完成度不通过');
ok(
  flow.missingConditions(fresh).includes('展览标题非空'),
  '缺失清单包含“展览标题非空”',
);
throws(() => svc.transition(d.id, '预览中'), '展览标题非空', '草稿（标题空白）→ 预览中 被拒绝');
ok(statusOf(svc, d.id) === '草稿', '标题为空被拒后保持草稿');
ok(storedStatus() === '草稿', '标题为空被拒后本地存储仍是草稿');
svc.updateInfo(d.id, {title: '测试展'});
ok(flow.isReady(fresh), '恢复标题后完成度重新通过');

console.log('\n[3] 合法前进链路');
svc.transition(d.id, '预览中');
ok(statusOf(svc, d.id) === '预览中', '草稿 → 预览中（条件满足）');
ok(storedStatus() === '预览中', '列表状态已同步并持久化为预览中');
svc.transition(d.id, '已上线');
ok(statusOf(svc, d.id) === '已上线', '预览中 → 已上线（上线校验通过）');
ok(storedStatus() === '已上线', '已上线状态同步到本地存储');

console.log('\n[4] 非法流转被拒绝，原状态保持');
throws(() => svc.transition(d.id, '草稿'), '相邻状态', '已上线 → 草稿 跨级回退被拒绝');
throws(() => svc.transition(d.id, '已上线'), '不是有效的状态变更', '重复流转到同一状态被拒绝');
throws(() => svc.transition(d.id, '未知态' as any), '未知的展览状态', '未知状态被拒绝');
throws(() => svc.release(d.id), '不能继续前进', '已上线不能继续前进');
ok(statusOf(svc, d.id) === '已上线', '非法流转后状态仍为已上线');
ok(storedStatus() === '已上线', '非法流转未污染本地存储');

console.log('\n[5] 已上线锁定编辑');
const before = JSON.stringify(fresh.pieces);
throws(() => svc.togglePiece(d.id, 'a2'), '已锁定', '已上线时不能增减作品');
throws(() => svc.updateInfo(d.id, {curator: '他人'}), '已锁定', '已上线时不能改信息');
ok(JSON.stringify(fresh.pieces) === before, '锁定下作品未被修改');
ok(fresh.curator !== '他人', '锁定下信息未被修改');

console.log('\n[6] 回退必须明确确认');
throws(() => svc.rollback(d.id), '明确确认', '已上线 → 预览中 未确认不生效');
throws(() => svc.transition(d.id, '预览中'), '明确确认', '直接 transition 回退未确认也被拒绝');
ok(statusOf(svc, d.id) === '已上线', '未确认回退后仍是已上线');
ok(storedStatus() === '已上线', '未确认回退未写入本地存储');
svc.rollback(d.id, true);
ok(statusOf(svc, d.id) === '预览中', '确认后 已上线 → 预览中');
ok(storedStatus() === '预览中', '回退后本地存储同步为预览中');

throws(() => svc.rollback(d.id), '明确确认', '预览中 → 草稿 未确认不生效');
ok(statusOf(svc, d.id) === '预览中', '未确认回退后仍是预览中');
svc.transition(d.id, '草稿', {confirmed: true});
ok(statusOf(svc, d.id) === '草稿', '确认后 预览中 → 草稿');
ok(storedStatus() === '草稿', '回退到草稿已同步到本地存储');

console.log('\n[7] 回退后再前进不能绕过上线/预览校验');
svc.transition(d.id, '预览中');
svc.togglePiece(d.id, 'a1'); // 预览中移除唯一作品
ok(statusOf(svc, d.id) === '预览中', '移除后仍是预览中');
ok(!flow.isReady(fresh), '完成度随编辑实时变为不通过');
throws(() => svc.transition(d.id, '已上线'), '条件未满足', '无作品时不能重新上线');
ok(statusOf(svc, d.id) === '预览中', '上线失败后保持预览中');
svc.togglePiece(d.id, 'a1'); // 重新加回
ok(flow.isReady(fresh), '补齐作品后完成度恢复');
svc.updateInfo(d.id, {title: ''});
throws(() => svc.transition(d.id, '已上线'), '展览标题非空', '预览中（标题为空）→ 已上线 被拒绝');
ok(statusOf(svc, d.id) === '预览中', '标题为空上线被拒后保持预览中');
ok(storedStatus() === '预览中', '标题为空上线被拒后本地存储仍是预览中');
svc.updateInfo(d.id, {title: '测试展'});
svc.transition(d.id, '草稿', {confirmed: true});
ok(statusOf(svc, d.id) === '草稿', '确认回退后 预览中 → 草稿');

console.log('\n[8] 跨级前进非法；完整往返后再上线');
throws(() => svc.transition(d.id, '已上线'), '相邻状态', '草稿 → 已上线 跨级前进被拒绝');
ok(statusOf(svc, d.id) === '草稿', '跨级被拒后保持草稿');
throws(() => svc.rollback(d.id), '不能回退', '草稿不能再回退');
svc.transition(d.id, '预览中');
svc.transition(d.id, '已上线');
ok(statusOf(svc, d.id) === '已上线', '再次走完 草稿→预览中→已上线');

console.log('\n[9] 完成度面板与状态门控始终同源');
for (const readyLike of [true, false]) {
  const base = {...fresh, pieces: readyLike ? ['a1'] : []};
  for (const s of ['草稿', '预览中', '已上线'] as const) {
    const ex = {...base, status: s};
    const panelAllows = flow.isReady(ex);
    const target = flow.nextStatus(s);
    let transitionAllows = true;
    if (target) {
      try {
        flow.validateTransition(ex, target);
      } catch {
        transitionAllows = false;
      }
    }
    ok(
      target === null || panelAllows === transitionAllows,
      target === null
        ? `${readyLike ? '条件满足' : '条件不满足'}时「${s}」无前进目标（最高状态）`
        : `${readyLike ? '条件满足' : '条件不满足'}时「${s}」面板可前进(${panelAllows}) 与状态校验(${transitionAllows}) 一致`,
    );
  }
}
throws(() => svc.rollback('missing-id'), '未找到', '不存在的展览操作被拒绝');

console.log('\n[10] 刷新一致性（子进程重新读取 localStorage）');
const res = spawnSync(process.execPath, [process.argv[1], 'reload'], {
  env: {...process.env, STORE_FILE, TEST_ID: testId},
  encoding: 'utf8',
});
process.stdout.write(res.stdout);
if (res.status !== 0) process.stderr.write(res.stderr);
ok(res.status === 0, '刷新子进程全部断言通过');

console.log(`\n父进程断言：${pass} 通过 / ${fail} 失败`);
process.exit(fail || res.status !== 0 ? 1 : 0);
