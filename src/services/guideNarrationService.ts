// 观众导览词：与作品一一对应的新增能力。
// 使用独立的 localStorage 命名空间，绝不读写策展工作面的 pottery-exhibit-studio-v1 数据。
import { ref } from 'vue';

const key = 'pottery-exhibit-narratives-v1';
const narratives = ref<Record<string, string>>(load());

function load(): Record<string, string> {
  try {
    const raw = localStorage.getItem(key);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function persist() {
  localStorage.setItem(key, JSON.stringify(narratives.value));
}

export function useGuideNarratives() {
  const getNarration = (artworkId: string): string => narratives.value[artworkId] ?? '';
  const saveNarration = (artworkId: string, text: string) => {
    const next = text.trim();
    if (next) narratives.value[artworkId] = next;
    else delete narratives.value[artworkId];
    persist();
    return next;
  };
  return { narratives, getNarration, saveNarration };
}
