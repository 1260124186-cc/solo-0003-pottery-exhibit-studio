import { ref } from 'vue';
import type { Exhibition } from '../domain/models';
import { exhibitions, artworks } from '../domain/seed';
import { releaseBlockers } from '../domain/completion';

const key = 'pottery-exhibit-studio-v1';
const saved = localStorage.getItem(key);
const state = ref<{ exhibitions: Exhibition[]; artworks: typeof artworks }>(
  saved ? JSON.parse(saved) : { exhibitions: [...exhibitions], artworks: [...artworks] },
);

function persist() {
  localStorage.setItem(key, JSON.stringify(state.value));
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
   * 上线：先跑完整的必要信息校验（与完成度面板同一套规则），
   * 任一不满足都直接抛出逐项原因，不做任何部分修改；
   * 全部通过才转换状态、同步列表与本地存储。
   */
  const release = (id: string) => {
    const e = state.value.exhibitions.find((x) => x.id === id);
    const blockers = releaseBlockers(e);
    if (blockers) throw Error(blockers.join('；'));
    e!.status = '已上线';
    persist();
  };

  const togglePiece = (id: string, art: string) => {
    const e = state.value.exhibitions.find((x) => x.id === id);
    if (!e) return;
    // 已上线内容在导览与分享中保持稳定，不再接受编排变更
    if (e.status === '已上线') return;
    e.pieces = e.pieces.includes(art)
      ? e.pieces.filter((x) => x !== art)
      : [...e.pieces, art];
    persist();
  };

  /** 修改基础信息字段；已上线展览锁定，保证导览/分享内容稳定 */
  const patch = (id: string, fields: Partial<Exhibition>) => {
    const e = state.value.exhibitions.find((x) => x.id === id);
    if (!e || e.status === '已上线') return;
    Object.assign(e, fields);
    persist();
  };

  return { state, create, release, togglePiece, patch };
}
