/* 纯领域规则验证：删除权限与级联清理范围。 */
import { describe, test, expect } from 'vitest';
import type { StudioState } from '../src/domain/models';
import { deletionBlockedReason, describeDeleteScope, removeDraftFromState } from '../src/domain/lifecycle';

function fixture(): StudioState {
  return {
    exhibitions: [
      { id: 'e1', title: '预览展', subtitle: '', curator: '甲', status: '预览中', opening: '2025-01-01', closing: '2025-02-01', pieces: ['a1'], description: '', copiedFrom: null },
      { id: 'e2', title: '上线展', subtitle: '', curator: '乙', status: '已上线', opening: '2025-01-01', closing: '2025-02-01', pieces: ['a1'], description: '', copiedFrom: null },
      { id: 'd1', title: '草稿源', subtitle: '', curator: '丙', status: '草稿', opening: '2025-01-01', closing: '2025-02-01', pieces: ['a1', 'a2'], description: '', copiedFrom: null },
      { id: 'd2', title: '复制草稿', subtitle: '', curator: '丙', status: '草稿', opening: '2025-01-01', closing: '2025-02-01', pieces: ['a1'], description: '', copiedFrom: 'd1' },
    ],
    artworks: [
      { id: 'a1', title: '作品1', artist: '', material: '', year: 2024, note: '', tone: '#000' },
      { id: 'a2', title: '作品2', artist: '', material: '', year: 2024, note: '', tone: '#111' },
    ],
    arrangements: [
      { exhibitionId: 'e1', updatedAt: '', rooms: [{ name: '厅', pieceIds: ['a1'] }] },
      { exhibitionId: 'd1', updatedAt: '', rooms: [{ name: '甲厅', pieceIds: ['a1'] }, { name: '乙厅', pieceIds: ['a2'] }] },
      { exhibitionId: 'd2', updatedAt: '', rooms: [{ name: '副本厅', pieceIds: ['a1'] }] },
    ],
    guides: [
      { id: 'g1', exhibitionId: 'e1', title: 't', body: '', updatedAt: '' },
      { id: 'g2', exhibitionId: 'd1', title: '源导览', body: '', updatedAt: '' },
      { id: 'g3', exhibitionId: 'd2', title: '副本导览', body: '', updatedAt: '' },
    ],
  };
}

describe('lifecycle: 删除权限', () => {
  test('草稿可删（无阻断原因）', () => {
    expect(deletionBlockedReason('草稿')).toBeNull();
  });
  test('预览中不可删且原因明确', () => {
    expect(deletionBlockedReason('预览中')).toContain('审阅');
  });
  test('已上线不可删且原因明确', () => {
    expect(deletionBlockedReason('已上线')).toContain('公众');
  });
  test('对预览中/已上线执行删除抛错，且不改动任何数据', () => {
    for (const id of ['e1', 'e2']) {
      const s = fixture();
      const snapshot = JSON.stringify(s);
      expect(() => removeDraftFromState(s, id)).toThrowError(/不能删除/);
      expect(JSON.stringify(s)).toBe(snapshot);
    }
  });
  test('删除不存在的 id 是安全的空操作', () => {
    const s = fixture();
    const snapshot = JSON.stringify(s);
    removeDraftFromState(s, 'nope');
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('lifecycle: 级联清理范围', () => {
  test('scope 精确统计该展览的编排/导览与复制副本', () => {
    const s = fixture();
    const scope = describeDeleteScope(s, 'd1');
    expect(scope.arrangementCount).toBe(1);
    expect(scope.guideCount).toBe(1);
    expect(scope.retainedCopies.map((e) => e.id)).toEqual(['d2']);
  });
  test('删除草稿：展览+其编排+其导览一起清掉', () => {
    const s = fixture();
    removeDraftFromState(s, 'd1');
    expect(s.exhibitions.some((e) => e.id === 'd1')).toBe(false);
    expect(s.arrangements.some((a) => a.exhibitionId === 'd1')).toBe(false);
    expect(s.guides.some((g) => g.exhibitionId === 'd1')).toBe(false);
  });
  test('删除草稿：复制出的其他草稿保留，仅清空 copiedFrom，且保留自身编排/导览', () => {
    const s = fixture();
    removeDraftFromState(s, 'd1');
    const copy = s.exhibitions.find((e) => e.id === 'd2');
    expect(copy).toBeTruthy();
    expect(copy!.copiedFrom).toBeNull();
    expect(s.arrangements.some((a) => a.exhibitionId === 'd2')).toBe(true);
    expect(s.guides.some((g) => g.exhibitionId === 'd2')).toBe(true);
  });
  test('删除草稿：作品档案、其他展览及其编排/导览不受影响', () => {
    const s = fixture();
    removeDraftFromState(s, 'd1');
    expect(s.artworks).toHaveLength(2);
    expect(s.exhibitions.map((e) => e.id)).toEqual(['e1', 'e2', 'd2']);
    expect(s.arrangements.map((a) => a.exhibitionId).sort()).toEqual(['d2', 'e1']);
    expect(s.guides.map((g) => g.exhibitionId).sort()).toEqual(['d2', 'e1']);
  });
});
