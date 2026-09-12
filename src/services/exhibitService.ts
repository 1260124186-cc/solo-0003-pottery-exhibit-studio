import { ref } from 'vue';
import { exhibitions, artworks } from '../domain/seed';
import type { Exhibition } from '../domain/models';
import { releaseDecision, piecesOf } from '../domain/readiness';

const key = 'pottery-exhibit-studio-v1';

function loadState(): { exhibitions: Exhibition[]; artworks: typeof artworks } {
  // localStorage 在非浏览器环境（如验证脚本）下可能不存在
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.exhibitions) && Array.isArray(parsed.artworks)) {
        return parsed;
      }
    } catch {
      // 数据损坏时回退到种子数据，不阻断应用
    }
  }
  return { exhibitions: [...exhibitions], artworks: [...artworks] };
}

const state = ref(loadState());

function persist(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(state.value));
}

/** 允许在面板中编辑的信息字段白名单 —— status 不在其中，面板永远无法改状态 */
const INFO_FIELDS = [
  'title',
  'subtitle',
  'curator',
  'opening',
  'closing',
  'description',
  'guide',
  'venue',
] as const;
type InfoField = (typeof INFO_FIELDS)[number];
export type { InfoField };

export function useExhibitService() {
  const create = (title: string): Exhibition => {
    if (!title.trim()) throw Error('展览名称不能为空');
    const e: Exhibition = {
      id: 'e' + Date.now(),
      title: title.trim(),
      // 新建草稿：除名称外其余字段为空，完成度面板应判为“空展览”
      subtitle: '',
      curator: '',
      status: '草稿',
      opening: '',
      closing: '',
      pieces: [],
      description: '',
    };
    state.value.exhibitions.unshift(e);
    persist();
    return e;
  };

  const release = (id: string): void => {
    const e = state.value.exhibitions.find((x) => x.id === id);
    if (!e) throw Error('未找到该展览');
    // 上线判定完全来自共享规则，面板与上线动作不可能各说各话
    const decision = releaseDecision(e);
    if (!decision.canRelease) {
      throw Error(decision.blockers[0] ?? '展览尚未达到上线条件');
    }
    e.status = '已上线';
    persist();
  };

  const togglePiece = (id: string, art: string): void => {
    const e = state.value.exhibitions.find((x) => x.id === id);
    if (!e) return;
    // 旧数据可能没有 pieces 或不是数组：经兜底读取后写回，杜绝运行时崩溃
    const current = piecesOf(e);
    e.pieces = current.includes(art)
      ? current.filter((x) => x !== art)
      : [...current, art];
    persist();
  };

  /** 仅更新白名单内的信息字段；不接受、不修改 status */
  const updateInfo = (id: string, patch: Partial<Pick<Exhibition, InfoField>>): void => {
    const e = state.value.exhibitions.find((x) => x.id === id);
    if (!e) return;
    for (const field of INFO_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(patch, field)) {
        e[field] = String(patch[field] ?? '');
      }
    }
    persist();
  };

  return { state, create, release, togglePiece, updateInfo };
}
