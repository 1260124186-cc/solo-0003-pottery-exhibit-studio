import './setup-storage.mjs';
import { nextTick } from 'vue';
import { useListFilter } from '../src/composables/useListFilter.ts';
import { useExhibitionList } from '../src/composables/useExhibitionList.ts';

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok - ${name}`);
  } else {
    failures++;
    console.error(`  FAIL - ${name}`);
  }
}

// 新进程 = 刷新页面：模块重新从 localStorage 恢复。
const { statusFilter } = useListFilter();
const list = useExhibitionList();
await nextTick();

check('刷新后恢复上次筛选项（草稿）', statusFilter.value === '草稿');
check('恢复后列表按草稿筛选', list.visibleExhibitions.value.map((e) => e.id).join(',') === 'e2');
check('恢复后确定性选中可见的第一条 e2', list.selected.value === 'e2');

// 无效的 UI 存储值要安全回退
const raw = globalThis.localStorage.getItem('pottery-exhibit-studio-ui-v1');
check('种子 UI 值确为草稿', raw === '草稿');

console.log(failures ? `\n${failures} 条失败` : '\n全部通过');
process.exit(failures ? 1 : 0);
