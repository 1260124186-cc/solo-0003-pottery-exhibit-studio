import { ref } from 'vue';
import { useExhibitService } from '../services/exhibitService';

const { state } = useExhibitService();

// 跨视图共享的当前选中展览（策展工作面选择，分享视图只读消费）
export const selectedExhibitionId = ref<string>(state.value.exhibitions[0]?.id ?? '');

export function useSelectedExhibition() {
  return { selectedExhibitionId };
}
