import type { Exhibition } from './models';

export type StatusFilter = '全部' | '草稿' | '预览中' | '已上线';

export const STATUS_FILTERS: StatusFilter[] = ['全部', '草稿', '预览中', '已上线'];

/** 从持久化内容恢复筛选项，无法识别的值一律回退为“全部”。 */
export function normalizeStatusFilter(value: unknown): StatusFilter {
  return (STATUS_FILTERS as string[]).includes(value as string)
    ? (value as StatusFilter)
    : '全部';
}

/** 筛选只判断展览自身的状态字段，与选中项无关。 */
export function matchesStatus(e: Exhibition, filter: StatusFilter): boolean {
  return filter === '全部' || e.status === filter;
}

export function filterExhibitions(
  exhibitions: Exhibition[],
  filter: StatusFilter,
): Exhibition[] {
  return exhibitions.filter((e) => matchesStatus(e, filter));
}

/**
 * 确定的自动选择规则：返回可见列表中的第一条。
 * 列表顺序（state 中的数据顺序）固定时，同样一组数据无论何时筛选都选中同一条；
 * 没有可见展览时返回空串，由工作面展示空状态。
 */
export function pickVisible(
  exhibitions: Exhibition[],
  filter: StatusFilter,
): string {
  return filterExhibitions(exhibitions, filter)[0]?.id ?? '';
}
