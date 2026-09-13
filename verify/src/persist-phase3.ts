import './storage-shim';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useExhibitService } from '../../src/services/exhibitService';

// 阶段三：历史脏数据（重复 id、pieces 为 null）全新加载时被稳定规整。
test('阶段三：加载时去重保留首次出现位置，非法 pieces 规整为空数组', () => {
  const svc = useExhibitService();
  const eDirty = svc.state.value.exhibitions.find((x: any) => x.id === 'eDirty')!;
  const eBroken = svc.state.value.exhibitions.find((x: any) => x.id === 'eBroken')!;
  assert.deepEqual(eDirty.pieces, ['a3', 'a1', 'a2']);
  assert.deepEqual(eBroken.pieces, []);
});
