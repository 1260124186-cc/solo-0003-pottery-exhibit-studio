import { computed, ref } from 'vue';
import { useExhibitService } from '../services/exhibitService';

// 策展工作流层：在 exhibitService（状态与持久化）之上，
// 负责展览选择、新建草稿、上线动作与提示文案的状态编排。
export function useExhibitionFlow() {
  const { state, create, release, togglePiece } = useExhibitService();

  // 当前选中的展览 id，初始为列表第一场
  const selectedId = ref<string>(state.value.exhibitions[0]?.id || '');
  // 新建草稿的名称输入
  const newTitle = ref('');
  // 右下角提示文案
  const notice = ref('');

  const current = computed(() => state.value.exhibitions.find((x: any) => x.id === selectedId.value));
  const totalPieces = computed(() => state.value.exhibitions.reduce((n: number, e: any) => n + e.pieces.length, 0));

  function select(id: string) {
    selectedId.value = id;
  }

  function createDraft() {
    try {
      const e = create(newTitle.value);
      selectedId.value = e.id;
      newTitle.value = '';
      notice.value = '已创建展览草稿';
    } catch (err: any) {
      notice.value = err.message;
    }
  }

  function releaseCurrent() {
    try {
      release(selectedId.value);
      notice.value = '展览已上线';
    } catch (err: any) {
      notice.value = err.message;
    }
  }

  function toggleArtwork(artworkId: string) {
    if (!current.value) return;
    togglePiece(current.value.id, artworkId);
  }

  return {
    state,
    selectedId,
    current,
    newTitle,
    notice,
    totalPieces,
    select,
    createDraft,
    releaseCurrent,
    toggleArtwork,
  };
}
