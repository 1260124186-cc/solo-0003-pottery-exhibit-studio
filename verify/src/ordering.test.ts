import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Artwork } from '../../src/domain/models';
import {
  movePiece,
  reorderPieces,
  buildGridRows,
  orderedArtworks,
  orderFingerprint,
  inspectOrder,
  buildExport,
} from '../../src/domain/ordering';

const artworks: Artwork[] = [
  { id: 'a1', title: 'T1', artist: 'x', material: 'm', year: 2024, note: 'n', tone: '#000' },
  { id: 'a2', title: 'T2', artist: 'x', material: 'm', year: 2024, note: 'n', tone: '#000' },
  { id: 'a3', title: 'T3', artist: 'x', material: 'm', year: 2024, note: 'n', tone: '#000' },
  { id: 'a4', title: 'T4', artist: 'x', material: 'm', year: 2024, note: 'n', tone: '#000' },
];

test('上移/下移交换相邻位置，边界处保持不变', () => {
  assert.deepEqual(movePiece(['a1', 'a2', 'a3'], 'a2', -1), ['a2', 'a1', 'a3']);
  assert.deepEqual(movePiece(['a1', 'a2', 'a3'], 'a2', 1), ['a1', 'a3', 'a2']);
  assert.deepEqual(movePiece(['a1', 'a2', 'a3'], 'a1', -1), ['a1', 'a2', 'a3']);
  assert.deepEqual(movePiece(['a1', 'a2', 'a3'], 'a3', 1), ['a1', 'a2', 'a3']);
  // 不修改原数组
  const src = ['a1', 'a2'];
  movePiece(src, 'a1', 1);
  assert.deepEqual(src, ['a1', 'a2']);
});

test('拖放到任意位置', () => {
  assert.deepEqual(reorderPieces(['a1', 'a2', 'a3', 'a4'], 'a4', 0), ['a4', 'a1', 'a2', 'a3']);
  assert.deepEqual(reorderPieces(['a1', 'a2', 'a3', 'a4'], 'a1', 2), ['a2', 'a3', 'a1', 'a4']);
  assert.deepEqual(reorderPieces(['a1', 'a2'], 'a1', 0), ['a1', 'a2']);
  assert.deepEqual(reorderPieces(['a1', 'a2'], 'a1', 9), ['a1', 'a2']);
  assert.deepEqual(reorderPieces(['a1', 'a2'], 'a9', 0), ['a1', 'a2']);
});

test('稳定性：相同操作得到相同结果；相邻交换可逆且确定', () => {
  const start = ['a1', 'a2', 'a3', 'a4'];
  // 同样输入执行两次结果完全一致
  const op = (p: string[]) => movePiece(p, 'a2', -1);
  assert.deepEqual(op(start), ['a2', 'a1', 'a3', 'a4']);
  assert.deepEqual(op(start), op(start));
  // 把 a2 再下移回去，精确恢复原顺序
  const back = movePiece(op(start), 'a2', 1);
  assert.deepEqual(back, start);
  // 多步确定序列：边界操作不产生位移，连续执行结果可复现
  const seq = (p: string[]) => {
    let q = p;
    q = movePiece(q, q[0], -1); // 在顶端再上移：无变化
    q = reorderPieces(q, 'a4', 0);
    q = movePiece(q, 'a4', 1);
    return q;
  };
  assert.deepEqual(seq(start), ['a1', 'a4', 'a2', 'a3']);
  assert.deepEqual(seq(start), seq(start));
});

test('网格：已编排严格按 pieces 顺序置顶，未编排稳定地留在后面且不参与排序', () => {
  const rows = buildGridRows(artworks, ['a3', 'a1']);
  assert.deepEqual(rows.map((r) => r.artwork.id), ['a3', 'a1', 'a2', 'a4']);
  assert.deepEqual(rows.map((r) => r.index), [0, 1, -1, -1]);
  assert.deepEqual(rows.map((r) => r.chosen), [true, true, false, false]);
});

test('orderedArtworks 与指纹只反映 pieces 顺序；脏数据被忽略时指纹仍与数组一致', () => {
  assert.deepEqual(orderedArtworks(artworks, ['a2', 'a4']).map((a) => a.id), ['a2', 'a4']);
  assert.equal(orderFingerprint(['a2', 'a4']), 'a2›a4');
  assert.deepEqual(orderedArtworks(artworks, ['a2', 'ghost', 'a4']).map((a) => a.id), ['a2', 'a4']);
});

test('inspectOrder 能发现重复与幽灵引用', () => {
  assert.deepEqual(inspectOrder({ pieces: ['a1', 'a2'] } as any, artworks).map((i) => i.code), []);
  const dup = inspectOrder({ pieces: ['a1', 'a1'] } as any, artworks);
  assert.ok(dup.some((i) => i.code === 'duplicate'));
  const ghost = inspectOrder({ pieces: ['a1', 'zzz'] } as any, artworks);
  assert.ok(ghost.some((i) => i.code === 'unknown-piece'));
});

test('导出读取的顺序与数量来自同一份 pieces，且不改写作品字段', () => {
  const ex = { id: 'eX', title: 'E', curator: 'c', status: '草稿', pieces: ['a4', 'a1', 'a2'] } as any;
  const out = buildExport(ex, artworks);
  assert.equal(out.pieceCount, 3);
  assert.equal(out.orderFingerprint, 'a4›a1›a2');
  assert.deepEqual(
    out.pieces.map((p) => [p.order, p.id, p.title]),
    [[1, 'a4', 'T4'], [2, 'a1', 'T1'], [3, 'a2', 'T2']],
  );
  assert.equal(artworks[0].id, 'a1'); // 档案原顺序未被排序操作影响
});
