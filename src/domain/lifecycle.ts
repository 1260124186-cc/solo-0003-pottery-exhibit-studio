import type { Exhibition, StudioState } from './models';

/** 删除草稿的唯一允许状态 */
export const DELETABLE_STATUS: Exhibition['status'] = '草稿';

/**
 * 只有“草稿”状态的展览允许删除。
 * “预览中”已进入对外审阅流程，“已上线”已经对公众发布，均不可删除。
 */
export function deletionBlockedReason(status: Exhibition['status']): string | null {
  if (status === '草稿') return null;
  if (status === '预览中') return '预览中的展览已进入审阅流程，不能删除；如需删除请先退回草稿。';
  return '已上线的展览已对公众发布，不能删除。';
}

/** 一场展览删除时关联数据的清理范围，用于删除前确认说明 */
export interface DeleteScope {
  exhibitionId: string;
  arrangementCount: number;
  guideCount: number;
  /** 由它复制出来、会被保留的独立草稿（仅清空来源关联） */
  retainedCopies: Exhibition[];
}

export function describeDeleteScope(state: StudioState, id: string): DeleteScope {
  return {
    exhibitionId: id,
    arrangementCount: state.arrangements.filter((a) => a.exhibitionId === id).length,
    guideCount: state.guides.filter((g) => g.exhibitionId === id).length,
    retainedCopies: state.exhibitions.filter((e) => e.copiedFrom === id),
  };
}

/**
 * 执行草稿删除并处理关联数据生命周期：
 * - 删除展览本身及其空间编排、导览文字（按 exhibitionId 精确级联）；
 * - 由它复制出的其他草稿保留为独立展览，只清空 copiedFrom 来源关联；
 * - 作品档案与其他展览的数据一律不动。
 *
 * 调用前必须先用 deletionBlockedReason 校验状态。
 */
export function removeDraftFromState(state: StudioState, id: string): void {
  const target = state.exhibitions.find((e) => e.id === id);
  if (!target) return;
  const blocked = deletionBlockedReason(target.status);
  if (blocked) throw Error(blocked);

  state.exhibitions = state.exhibitions.filter((e) => e.id !== id);
  state.arrangements = state.arrangements.filter((a) => a.exhibitionId !== id);
  state.guides = state.guides.filter((g) => g.exhibitionId !== id);
  // 复制出的草稿是独立展览：保留，仅解除来源关联，避免悬空引用
  for (const copy of state.exhibitions) {
    if (copy.copiedFrom === id) copy.copiedFrom = null;
  }
}
