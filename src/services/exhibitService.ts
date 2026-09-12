import {ref} from 'vue';
import {exhibitions, artworks} from '../domain/seed';
import type {Exhibition, ExhibitStatus} from '../domain/models';
import {
  validateTransition,
  nextStatus,
  prevStatus,
  isReady,
  missingConditions,
  completionChecklist,
} from '../domain/flow';

const key = 'pottery-exhibit-studio-v1';

const saved = localStorage.getItem(key);
const state = ref(
  saved
    ? JSON.parse(saved)
    : {exhibitions: [...exhibitions], artworks: [...artworks]},
);

function persist() {
  localStorage.setItem(key, JSON.stringify(state.value));
}

function findExhibition(id: string): Exhibition {
  const e = state.value.exhibitions.find((x: Exhibition) => x.id === id);
  if (!e) throw new Error('未找到指定展览');
  return e;
}

export function useExhibitService() {
  const create = (title: string) => {
    if (!title.trim()) throw Error('展览名称不能为空');
    const e: Exhibition = {
      id: 'e' + Date.now(),
      title: title.trim(),
      subtitle: '新的展览叙事',
      curator: '未署名',
      status: '草稿',
      opening: '2025-01-01',
      closing: '2025-03-01',
      pieces: [],
      description: '等待策展人补充展览说明。',
    };
    state.value.exhibitions.unshift(e);
    persist();
    return e;
  };

  /**
   * 受控状态流转：只有 validateTransition 全部通过才会写入并持久化；
   * 校验抛错时原状态保持不变，列表与 localStorage 都不改动。
   */
  const transition = (
    id: string,
    target: ExhibitStatus,
    options: {confirmed?: boolean} = {},
  ) => {
    const e = findExhibition(id);
    // 先校验、后写入，失败时 e 不会有任何变化
    validateTransition(e, target, options);
    e.status = target;
    persist();
  };

  /** 兼容旧调用：从当前状态前进一步。 */
  const release = (id: string) => {
    const e = findExhibition(id);
    const target = nextStatus(e.status);
    if (!target) throw new Error('已上线的展览不能继续前进');
    transition(id, target);
  };

  /** 受控回退：必须传 confirmed: true。 */
  const rollback = (id: string, confirmed = false) => {
    const e = findExhibition(id);
    const target = prevStatus(e.status);
    if (!target) throw new Error('草稿状态不能回退');
    transition(id, target, {confirmed});
  };

  const togglePiece = (id: string, art: string) => {
    const e = findExhibition(id);
    if (e.status === '已上线') {
      throw new Error('已上线的展览已锁定，如需调整请先回退到预览中');
    }
    e.pieces = e.pieces.includes(art)
      ? e.pieces.filter((x: string) => x !== art)
      : [...e.pieces, art];
    persist();
  };

  /** 更新展览基础信息（标题/副标题/策展人/展期/说明），已上线锁定。 */
  const updateInfo = (
    id: string,
    patch: Partial<
      Pick<
        Exhibition,
        'title' | 'subtitle' | 'curator' | 'opening' | 'closing' | 'description'
      >
    >,
  ) => {
    const e = findExhibition(id);
    if (e.status === '已上线') {
      throw new Error('已上线的展览已锁定，如需调整请先回退到预览中');
    }
    Object.assign(e, patch);
    persist();
  };

  return {
    state,
    create,
    release,
    transition,
    rollback,
    togglePiece,
    updateInfo,
    isReady,
    missingConditions,
    completionChecklist,
  };
}
