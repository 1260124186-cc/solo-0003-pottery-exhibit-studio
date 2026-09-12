import { ref } from 'vue';
import { normalizeStatusFilter, type StatusFilter } from '../domain/listFilter';

/**
 * 筛选项属于界面偏好，单独存一个 key，与展览/作品数据
 * （pottery-exhibit-studio-v1）分开保存，互不覆盖。
 */
const filterKey = 'pottery-exhibit-studio-ui-v1';

function load(): StatusFilter {
  try {
    return normalizeStatusFilter(localStorage.getItem(filterKey));
  } catch {
    return '全部';
  }
}

// 模块级单例：跨组件共享，刷新页面时从 localStorage 恢复上次选择。
const statusFilter = ref<StatusFilter>(load());

function save(filter: StatusFilter) {
  try {
    localStorage.setItem(filterKey, filter);
  } catch {
    // 持久化失败不影响本次会话内的筛选。
  }
}

export function useListFilter() {
  function setStatusFilter(filter: StatusFilter) {
    if (filter === statusFilter.value) return;
    statusFilter.value = filter;
    save(filter);
  }
  return { statusFilter, setStatusFilter };
}
