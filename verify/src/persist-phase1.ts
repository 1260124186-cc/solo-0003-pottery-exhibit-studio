import './storage-shim';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useExhibitService } from '../../src/services/exhibitService';

// 阶段一：全新加载种子数据，执行调整顺序与跨展览隔离操作，并把存档交给“刷新后”阶段。
test('阶段一：调整顺序即时写入 localStorage，且不影响另一展览与作品字段', () => {
  const svc = useExhibitService();
  const e1 = svc.state.value.exhibitions.find((x: any) => x.id === 'e1')!;
  const e2 = svc.state.value.exhibitions.find((x: any) => x.id === 'e2')!;
  const a1 = svc.state.value.artworks.find((a: any) => a.id === 'a1')!;

  // 种子：e1 = [a1,a3]，e2 = [a2,a4]
  assert.deepEqual(e1.pieces, ['a1', 'a3']);
  const a1Title = a1.title;

  // 在 e1 把最后一件 a3 上移到首位，并把 a3 再拖到原位（相同操作稳定可逆）
  svc.movePiece('e1', 'a3', -1);
  assert.deepEqual(e1.pieces, ['a3', 'a1']);
  svc.reorderPiece('e1', 'a3', 1);
  assert.deepEqual(e1.pieces, ['a1', 'a3']);
  // 再把 a1 下移
  svc.movePiece('e1', 'a1', 1);
  assert.deepEqual(e1.pieces, ['a3', 'a1']);

  // e1 加入 a2（追加到末尾），再拖到第一位
  svc.togglePiece('e1', 'a2');
  assert.deepEqual(e1.pieces, ['a3', 'a1', 'a2']);
  svc.reorderPiece('e1', 'a2', 0);
  assert.deepEqual(e1.pieces, ['a2', 'a3', 'a1']);

  // 另一展览的编排完全不受影响
  assert.deepEqual(e2.pieces, ['a2', 'a4']);
  // 作品本身字段不变（顺序信息只存在展览的 pieces 上）
  assert.equal(a1.title, a1Title);
  assert.deepEqual(
    svc.state.value.artworks.map((a: any) => a.id),
    ['a1', 'a2', 'a3', 'a4'],
  );

  // 每次操作都已实时持久化
  const saved = JSON.parse(localStorage.getItem('pottery-exhibit-studio-v1')!);
  const se1 = saved.exhibitions.find((x: any) => x.id === 'e1');
  assert.deepEqual(se1.pieces, ['a2', 'a3', 'a1']);

  // 输出存档，供阶段二模拟刷新
  console.log('SEED_OUT:' + localStorage.getItem('pottery-exhibit-studio-v1'));
});
