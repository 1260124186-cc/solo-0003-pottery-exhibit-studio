import { ref } from 'vue';
import { exhibitions, artworks } from '../domain/seed';
import type { Artwork, Exhibition } from '../domain/models';
import { validateExhibitionInfo } from '../domain/exhibitionInfo';
import type { ExhibitionInfoInput } from '../domain/exhibitionInfo';

const key = 'pottery-exhibit-studio-v1';

interface StudioState {
  exhibitions: Exhibition[];
  artworks: Artwork[];
}

function load(): StudioState {
  const saved = localStorage.getItem(key);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as StudioState;
      if (parsed && Array.isArray(parsed.exhibitions) && Array.isArray(parsed.artworks)) {
        return parsed;
      }
    } catch {
      // 存档损坏时回落到初始数据，避免整个工作面不可用
    }
  }
  return { exhibitions: [...exhibitions], artworks: [...artworks] };
}

/** 单例状态：列表、详情、导览、分享四处共享同一份数据（单一版本原则）。 */
const state = ref<StudioState>(load());

function persist() {
  localStorage.setItem(key, JSON.stringify(state.value));
}

export function useExhibitService() {
  const create = (title: string): Exhibition => {
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
      description: '等待策展人补充展览说明。'
    };
    state.value.exhibitions.unshift(e);
    persist();
    return e;
  };

  const release = (id: string) => {
    const e = state.value.exhibitions.find((x) => x.id === id);
    if (!e) throw Error('找不到该展览');
    if (!e.pieces.length) throw Error('至少编排一件作品后才能上线');
    e.status = '已上线';
    persist();
  };

  const togglePiece = (id: string, art: string) => {
    const e = state.value.exhibitions.find((x) => x.id === id);
    if (!e) return;
    e.pieces = e.pieces.includes(art)
      ? e.pieces.filter((x) => x !== art)
      : [...e.pieces, art];
    persist();
  };

  /**
   * 编辑展览信息：先完成全部校验，再整体替换五个字段。
   * 校验失败不触碰任何数据；持久化失败回滚，保证不写入一半数据。
   * 只替换目标展览的五项信息，作品编排（pieces）与其他展览均不变。
   */
  const updateInfo = (id: string, input: ExhibitionInfoInput) => {
    const e = state.value.exhibitions.find((x) => x.id === id);
    if (!e) throw Error('找不到该展览');
    // 先校验：抛出即代表本次保存完全未生效
    const info = validateExhibitionInfo(input);

    const snapshot: Exhibition = { ...e, pieces: [...e.pieces] };
    e.subtitle = info.subtitle;
    e.curator = info.curator;
    e.opening = info.opening;
    e.closing = info.closing;
    e.description = info.description;
    try {
      persist();
    } catch {
      // 存储失败：完整回滚，内存与本地存储保持同一版本
      Object.assign(e, snapshot);
      throw Error('保存失败：本地存储不可用，修改未生效');
    }
  };

  return { state, create, release, togglePiece, updateInfo };
}
