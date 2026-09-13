import './storage-shim';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useExhibitService } from '../../src/services/exhibitService';

// 阶段二：携带阶段一的存档全新加载，模拟刷新 / 切换展览后再回来。
test('阶段二：刷新后顺序恢复；在另一展览操作后切回顺序不变', () => {
  const svc = useExhibitService();
  const e1 = svc.state.value.exhibitions.find((x: any) => x.id === 'e1')!;
  const e2 = svc.state.value.exhibitions.find((x: any) => x.id === 'e2')!;

  // 刷新恢复：顺序与阶段一最后状态一致
  assert.deepEqual(e1.pieces, ['a2', 'a3', 'a1']);
  assert.deepEqual(e2.pieces, ['a2', 'a4']);

  // 模拟“切换到 e2 做编排，再切回 e1”：e1 顺序不变
  svc.movePiece('e2', 'a4', -1);
  assert.deepEqual(e2.pieces, ['a4', 'a2']);
  assert.deepEqual(e1.pieces, ['a2', 'a3', 'a1']);

  // 同一作品在两个展览里各有各的位置：a2 在 e1 是第 1，在 e2 是第 2
  assert.equal(e1.pieces.indexOf('a2'), 0);
  assert.equal(e2.pieces.indexOf('a2'), 1);

  // 再次持久化时 e1 依旧未被 e2 的操作波及
  const saved = JSON.parse(localStorage.getItem('pottery-exhibit-studio-v1')!);
  assert.deepEqual(saved.exhibitions.find((x: any) => x.id === 'e1').pieces, ['a2', 'a3', 'a1']);
  assert.deepEqual(saved.exhibitions.find((x: any) => x.id === 'e2').pieces, ['a4', 'a2']);
});
