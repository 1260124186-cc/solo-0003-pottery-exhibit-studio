import { ref } from 'vue';
import type { Exhibition, GuideText, SpaceArrangement, StudioState } from '../domain/models';
import { artworks as seedArtworks, arrangements as seedArrangements, exhibitions as seedExhibitions, guides as seedGuides } from '../domain/seed';
import { deletionBlockedReason, removeDraftFromState } from '../domain/lifecycle';

const key = 'pottery-exhibit-studio-v1';

function emptyArrangement(exhibitionId: string): SpaceArrangement {
  return { exhibitionId, updatedAt: '', rooms: [] };
}

function defaultGuide(exhibitionId: string, seq: number): GuideText {
  return {
    id: 'g-seed-' + exhibitionId + '-' + seq,
    exhibitionId,
    title: '导览',
    body: '等待策展人补充导览文字。',
    updatedAt: '',
  };
}

function isExhibition(x: unknown): x is Exhibition {
  return !!x && typeof x === 'object' && typeof (x as Exhibition).id === 'string' && typeof (x as Exhibition).status === 'string';
}

/**
 * 载入并归一化持久化数据：
 * - 旧版本只存了 exhibitions / artworks，这里为老展览补齐编排与导览，保证刷新后功能完整；
 * - 清理指向不存在展览的孤儿编排/导览（非删除操作不会产生孤儿，仅修复历史脏数据）；
 * - 复制来源指向不存在展览时，解除来源关联。
 */
export function hydrate(raw: unknown): StudioState {
  const parsed = raw && typeof raw === 'object' ? (raw as Partial<StudioState>) : null;
  // 无存档（全新用户）时整体使用种子数据；有存档时按字段迁移，补齐旧版本缺失的编排与导览
  if (!parsed) {
    return {
      exhibitions: structuredClone(seedExhibitions),
      artworks: structuredClone(seedArtworks),
      arrangements: structuredClone(seedArrangements),
      guides: structuredClone(seedGuides),
    };
  }
  const exhibitions = Array.isArray(parsed.exhibitions) ? parsed.exhibitions.filter(isExhibition).map((e) => ({ ...e, copiedFrom: e.copiedFrom ?? null })) : structuredClone(seedExhibitions);
  const artworks = Array.isArray(parsed.artworks) && parsed.artworks.length ? (parsed.artworks as StudioState['artworks']) : structuredClone(seedArtworks);
  const ids = new Set(exhibitions.map((e) => e.id));

  const arrangements = (Array.isArray(parsed.arrangements) ? (parsed.arrangements as SpaceArrangement[]) : [])
    .filter((a) => a && ids.has(a.exhibitionId));
  const arrangementIds = new Set(arrangements.map((a) => a.exhibitionId));
  for (const e of exhibitions) {
    if (!arrangementIds.has(e.id)) arrangements.push(emptyArrangement(e.id));
  }

  const guides = (Array.isArray(parsed.guides) ? (parsed.guides as GuideText[]) : [])
    .filter((g) => g && ids.has(g.exhibitionId));
  const guidesByExhibition = new Map<string, number>();
  for (const g of guides) guidesByExhibition.set(g.exhibitionId, (guidesByExhibition.get(g.exhibitionId) ?? 0) + 1);
  for (const e of exhibitions) {
    if (!guidesByExhibition.has(e.id)) guides.push(defaultGuide(e.id, 1));
  }

  for (const e of exhibitions) {
    if (e.copiedFrom && !ids.has(e.copiedFrom)) e.copiedFrom = null;
  }

  return { exhibitions, artworks, arrangements, guides };
}

function load(): StudioState {
  try {
    const raw = localStorage.getItem(key);
    return hydrate(raw ? JSON.parse(raw) : null);
  } catch {
    return hydrate(null);
  }
}

const state = ref<StudioState>(load());

function persist() {
  localStorage.setItem(key, JSON.stringify(state.value));
}

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return prefix + Date.now().toString(36) + '-' + seq;
}

/** 深拷贝响应式状态中的普通数据（与持久化同样走 JSON，结构都是可序列化的） */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function useExhibitService() {
  const create = (title: string): Exhibition => {
    if (!title.trim()) throw Error('展览名称不能为空');
    const id = nextId('e');
    const e: Exhibition = {
      id,
      title: title.trim(),
      subtitle: '新的展览叙事',
      curator: '未署名',
      status: '草稿',
      opening: '2025-01-01',
      closing: '2025-03-01',
      pieces: [],
      description: '等待策展人补充展览说明。',
      copiedFrom: null,
    };
    state.value.exhibitions.unshift(e);
    state.value.arrangements.push(emptyArrangement(id));
    state.value.guides.push(defaultGuide(id, 1));
    persist();
    return e;
  };

  /** 复制为草稿：副本是独立展览，拥有自己的编排与导览，与源再无数据级联关系（仅保留来源标记） */
  const duplicate = (sourceId: string): Exhibition => {
    const src = state.value.exhibitions.find((x) => x.id === sourceId);
    if (!src) throw Error('源展览不存在');
    const id = nextId('e');
    const now = new Date().toISOString().slice(0, 10);
    const copy: Exhibition = {
      ...clone(src),
      id,
      title: src.title + ' · 副本',
      status: '草稿',
      copiedFrom: src.id,
    };
    const srcArrangement = state.value.arrangements.find((a) => a.exhibitionId === sourceId);
    const arrangement: SpaceArrangement = {
      exhibitionId: id,
      updatedAt: now,
      rooms: clone(srcArrangement?.rooms ?? []),
    };
    const copyGuides: GuideText[] = state.value.guides
      .filter((g) => g.exhibitionId === sourceId)
      .map((g) => ({ ...clone(g), id: nextId('g'), exhibitionId: id }));
    state.value.exhibitions.unshift(copy);
    state.value.arrangements.push(arrangement);
    state.value.guides.push(...copyGuides);
    persist();
    return copy;
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
    if (e.pieces.includes(art)) {
      e.pieces = e.pieces.filter((x) => x !== art);
      // 同步清理空间编排中对该作品的摆放引用，避免悬空
      const arrangement = state.value.arrangements.find((a) => a.exhibitionId === id);
      if (arrangement) {
        for (const room of arrangement.rooms) room.pieceIds = room.pieceIds.filter((p) => p !== art);
      }
    } else {
      e.pieces = [...e.pieces, art];
    }
    persist();
  };

  /** 删除草稿：状态校验 + 级联清理（编排/导览随展删除，复制出的草稿保留），并立即持久化 */
  const remove = (id: string) => {
    const e = state.value.exhibitions.find((x) => x.id === id);
    if (!e) return;
    const blocked = deletionBlockedReason(e.status);
    if (blocked) throw Error(blocked);
    removeDraftFromState(state.value, id);
    persist();
  };

  return { state, create, duplicate, release, togglePiece, remove };
}
