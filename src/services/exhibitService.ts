import { ref } from 'vue';
import { exhibitions, artworks } from '../domain/seed';
import type { Artwork, Exhibition } from '../domain/models';
import { movePiece as movePieceOrder, reorderPieces as reorderPieceOrder } from '../domain/ordering';

const key = 'pottery-exhibit-studio-v1';
const saved = localStorage.getItem(key);

interface State {
  exhibitions: Exhibition[];
  artworks: Artwork[];
}

function sanitize(): State {
  const data: State = saved
    ? (JSON.parse(saved) as State)
    : { exhibitions: [...exhibitions], artworks: [...artworks] };
  // 顺序数组只允许每件作品出现一次：规整历史数据时保留首次出现的位置，排序保持稳定。
  data.exhibitions.forEach((e) => {
    e.pieces = [...new Set(Array.isArray(e.pieces) ? e.pieces : [])];
  });
  return data;
}

const state = ref<State>(sanitize());

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
      description: '等待策展人补充展览说明。',
    };
    state.value.exhibitions.unshift(e);
    persist();
    return e;
  };
  const release = (id: string) => {
    const e = state.value.exhibitions.find((x) => x.id === id);
    if (!e || !e.pieces.length) throw Error('至少编排一件作品后才能上线');
    e.status = '已上线';
    persist();
  };
  const togglePiece = (id: string, art: string) => {
    const e = state.value.exhibitions.find((x) => x.id === id);
    if (!e) return;
    // 新加入的作品追加到该展览顺序末尾；移除只影响本展览的顺序数组，作品本身字段不动。
    e.pieces = e.pieces.includes(art) ? e.pieces.filter((x) => x !== art) : [...e.pieces, art];
    persist();
  };
  const movePiece = (id: string, art: string, dir: -1 | 1) => {
    const e = state.value.exhibitions.find((x) => x.id === id);
    if (!e) return;
    e.pieces = movePieceOrder(e.pieces, art, dir);
    persist();
  };
  const reorderPiece = (id: string, art: string, target: number) => {
    const e = state.value.exhibitions.find((x) => x.id === id);
    if (!e) return;
    e.pieces = reorderPieceOrder(e.pieces, art, target);
    persist();
  };
  return { state, create, release, togglePiece, movePiece, reorderPiece };
}
