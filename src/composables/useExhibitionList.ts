import { computed, ref, watch } from 'vue';
import { useExhibitService } from '../services/exhibitService';
import { useListFilter } from './useListFilter';
import { filterExhibitions, pickVisible } from '../domain/listFilter';

export function useExhibitionList() {
  const { state } = useExhibitService();
  const { statusFilter } = useListFilter();

  const visibleExhibitions = computed(() =>
    filterExhibitions(state.value.exhibitions, statusFilter.value),
  );

  // 进入时确定性地选中第一条（与 pickVisible 同规则）。
  const selected = ref(
    pickVisible(state.value.exhibitions, statusFilter.value),
  );

  // 当前展览被筛掉（或被删除、列表变空）时，自动选中仍可见的第一条。
  // 只依赖可见列表与选中项，筛选本身不改动任何展览数据。
  watch(
    [visibleExhibitions, selected],
    ([list]) => {
      if (selected.value && list.some((e) => e.id === selected.value)) return;
      selected.value = list[0]?.id ?? '';
    },
    { immediate: true },
  );

  return { statusFilter, visibleExhibitions, selected };
}
