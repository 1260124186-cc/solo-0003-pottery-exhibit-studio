import './setup-storage.mjs';
import { nextTick } from 'vue';
import { useExhibitionList } from '../src/composables/useExhibitionList.ts';

let failures = 0;
const check = (name, cond) => {
  console.log(cond ? `  ok - ${name}` : `  FAIL - ${name}`);
  if (!cond) failures++;
};

const list = useExhibitionList();
await nextTick();
check('损坏的筛选项回退为全部', list.statusFilter.value === '全部');
check('回退后展示全部 2 条', list.visibleExhibitions.value.length === 2);
check('回退后确定性选中 e1', list.selected.value === 'e1');

console.log(failures ? `\n${failures} 条失败` : '\n全部通过');
process.exit(failures ? 1 : 0);
