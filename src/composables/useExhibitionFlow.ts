import { computed } from 'vue';
import { useExhibitService } from '../services/exhibitService';
import { piecesOf } from '../domain/readiness';

export function useExhibitionFlow() {
  const svc = useExhibitService();
  // 统一走 piecesOf：旧数据缺少 pieces 字段时计数为 0，而不是抛错
  const totalPieces = computed(() =>
    svc.state.value.exhibitions.reduce((n, e) => n + piecesOf(e).length, 0),
  );
  return { ...svc, totalPieces };
}
