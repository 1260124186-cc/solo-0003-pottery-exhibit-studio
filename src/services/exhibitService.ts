import { ref } from 'vue';
import { exhibitions as seedExhibitions, artworks as seedArtworks } from '../domain/seed';
import type { Artwork, Exhibition } from '../domain/models';

export interface StudioState {
  exhibitions: Exhibition[];
  artworks: Artwork[];
}

const STORAGE_KEY = 'pottery-exhibit-studio-v1';

function loadInitialState(): StudioState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StudioState;
      if (parsed && Array.isArray(parsed.exhibitions) && Array.isArray(parsed.artworks)) {
        return parsed;
      }
    }
  } catch {
    // 本地数据损坏或不可读时回退到种子数据
  }
  return { exhibitions: [...seedExhibitions], artworks: [...seedArtworks] };
}

const state = ref<StudioState>(loadInitialState());

/**
 * 所有写操作都进入同一条串行队列。每个任务在真正执行时才读取最新状态，
 * 因此连续快速点击「加入 / 移出」、或抽屉内外两个入口同时改动同一编排，
 * 任务之间也不会交错：内存状态永远等于最后一次落盘的状态。
 */
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => T): Promise<T> {
  const result = queue.then(task, task);
  // 单个任务失败不能让后续任务全部短路
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * 改状态与写 localStorage 是一个原子步骤：先基于最新状态计算，
 * 再持久化；持久化失败就回滚快照并把错误抛给调用方，
 * 保证「界面显示」「计数」「本地存储」三者始终一致。
 */
function commit<T>(mutate: () => T): Promise<T> {
  return enqueue(() => {
    const snapshot = JSON.stringify(state.value);
    try {
      const result = mutate();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value));
      return result;
    } catch (err) {
      state.value = JSON.parse(snapshot) as StudioState;
      throw err;
    }
  });
}

// 其他标签页改动存储时，同步到本页，保证多入口看到的编排一致
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || event.newValue === null) return;
    try {
      const incoming = JSON.parse(event.newValue) as StudioState;
      if (incoming && Array.isArray(incoming.exhibitions) && Array.isArray(incoming.artworks)) {
        state.value = incoming;
      }
    } catch {
      // 忽略无法解析的跨页数据
    }
  });
}

export function useExhibitService() {
  const create = (title: string) =>
    commit(() => {
      const name = title.trim();
      if (!name) throw new Error('展览名称不能为空');
      const exhibition: Exhibition = {
        id: 'e' + Date.now(),
        title: name,
        subtitle: '新的展览叙事',
        curator: '未署名',
        status: '草稿',
        opening: '2025-01-01',
        closing: '2025-03-01',
        pieces: [],
        description: '等待策展人补充展览说明。',
      };
      state.value.exhibitions.unshift(exhibition);
      return exhibition;
    });

  const release = (id: string) =>
    commit(() => {
      const exhibition = state.value.exhibitions.find((item) => item.id === id);
      if (!exhibition) throw new Error('展览不存在或已被删除');
      if (!exhibition.pieces.length) throw new Error('至少编排一件作品后才能上线');
      exhibition.status = '已上线';
    });

  /** 幂等加入：执行时若已在展览中则保持不变，重复/乱序调用结果可预测 */
  const addPiece = (exhibitId: string, artworkId: string) =>
    commit<void>(() => {
      const exhibition = state.value.exhibitions.find((item) => item.id === exhibitId);
      if (!exhibition) throw new Error('展览不存在或已被删除');
      if (!exhibition.pieces.includes(artworkId)) {
        exhibition.pieces = [...exhibition.pieces, artworkId];
      }
    });

  /** 幂等移出：执行时若已不在展览中则保持不变 */
  const removePiece = (exhibitId: string, artworkId: string) =>
    commit<void>(() => {
      const exhibition = state.value.exhibitions.find((item) => item.id === exhibitId);
      if (!exhibition) throw new Error('展览不存在或已被删除');
      if (exhibition.pieces.includes(artworkId)) {
        exhibition.pieces = exhibition.pieces.filter((id) => id !== artworkId);
      }
    });

  return { state, create, release, addPiece, removePiece };
}
