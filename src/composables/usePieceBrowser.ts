import {computed, type Ref} from 'vue';
import type {Artwork} from '../domain/models';

/** 作品网格的展示排序：默认按档案顺序（即展览已保存的编排顺序），或按年份升降序。 */
export type PieceSortMode = 'default' | 'year-desc' | 'year-asc';

/**
 * 作品网格的“展示视图”：筛选与排序只作用于返回的派生列表，
 * 绝不修改作品档案顺序，也不触碰展览里已保存的 pieces 顺序。
 *
 * 搜索、详情、导览等入口若需要同一批作品，应在本管线（筛选 → 稳定排序）上
 * 继续组合，而不是各自重排，避免同一批作品在不同入口呈现不一致。
 */
export function usePieceBrowser(
  artworks: Ref<Artwork[]>,
  sortMode: Ref<PieceSortMode>,
  artistFilter: Ref<string>,
) {
  // 作者名单按档案顺序首次出现的次序生成，保证选项稳定、不随刷新跳动。
  const artists = computed<string[]>(() => [
    ...new Set(artworks.value.map((a) => a.artist)),
  ]);

  const isFiltering = computed(
    () => sortMode.value !== 'default' || artistFilter.value !== '',
  );

  // 稳定排序：在副本上以“档案下标”作为并列时的次序键，
  // 同年份的作品始终保持已保存的相对顺序，多次计算/刷新结果一致。
  const visiblePieces = computed<Artwork[]>(() => {
    const indexed = artworks.value.map((a, index) => ({a, index}));
    const rows =
      artistFilter.value === ''
        ? indexed
        : indexed.filter(({a}) => a.artist === artistFilter.value);

    if (sortMode.value === 'year-desc') {
      rows.sort((x, y) => y.a.year - x.a.year || x.index - y.index);
    } else if (sortMode.value === 'year-asc') {
      rows.sort((x, y) => x.a.year - y.a.year || x.index - y.index);
    } else {
      rows.sort((x, y) => x.index - y.index);
    }
    return rows.map(({a}) => a);
  });

  return {artists, isFiltering, visiblePieces};
}
