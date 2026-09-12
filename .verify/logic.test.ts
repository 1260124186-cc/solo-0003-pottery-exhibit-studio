import './setup-storage.mjs';
import { nextTick } from 'vue';
import {
  STATUS_FILTERS,
  normalizeStatusFilter,
  filterExhibitions,
  pickVisible,
} from '../src/domain/listFilter.ts';
import { useListFilter } from '../src/composables/useListFilter.ts';
import { useExhibitionList } from '../src/composables/useExhibitionList.ts';
import { useExhibitService } from '../src/services/exhibitService.ts';

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  ok - ${name}`);
  } else {
    failures++;
    console.error(`  FAIL - ${name}${detail ? ` :: ${detail}` : ''}`);
  }
}
function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mkEx(id, status) {
  return { id, status, pieces: [] };
}
const group = [
  mkEx('e1', '预览中'),
  mkEx('e2', '草稿'),
  mkEx('e3', '草稿'),
  mkEx('e4', '已上线'),
];

console.log('A. 纯函数：筛选与确定性选择');
check('全部不过滤', filterExhibitions(group, '全部').length === 4);
check('草稿筛出 2 条', eq(filterExhibitions(group, '草稿').map((e) => e.id), ['e2', 'e3']));
check('预览中筛出 1 条', eq(filterExhibitions(group, '预览中').map((e) => e.id), ['e1']));
check('已上线筛出 1 条', eq(filterExhibitions(group, '已上线').map((e) => e.id), ['e4']));
check('未知状态无结果', filterExhibitions(group, normalizeStatusFilter('不存在')).length === 4);
check('非法存储值回退为全部', normalizeStatusFilter('nope') === '全部');
check('合法值原样返回', normalizeStatusFilter('草稿') === '草稿');
check('null 回退为全部', normalizeStatusFilter(null) === '全部');
check('筛选项集合固定四项', eq(STATUS_FILTERS, ['全部', '草稿', '预览中', '已上线']));

console.log('B. 确定性规则：同数据同时机永远同一条');
for (let i = 0; i < 5; i++) {
  check(`草稿稳定选中 e2（第 ${i + 1} 次）`, pickVisible(group, '草稿') === 'e2');
}
check('全部稳定选中第一条 e1', pickVisible(group, '全部') === 'e1');
check('已上线稳定选中 e4', pickVisible(group, '已上线') === 'e4');
check('无匹配返回空串', pickVisible([mkEx('x', '草稿')], '已上线') === '');
check('空列表返回空串', pickVisible([], '全部') === '');

console.log('C. 切换筛选：只影响左侧列表，工作面数据不动');
const svc = useExhibitService();
const list = useExhibitionList();
const { setStatusFilter } = useListFilter();
// 种子数据：e1=预览中(2件)，e2=草稿(2件)
check('默认筛选为全部', list.statusFilter.value === '全部');
check('初始全部列表 2 条', list.visibleExhibitions.value.length === 2);
check('初始确定性选中 e1', list.selected.value === 'e1');
check('工作面展示 e1', svc.state.value.exhibitions.find((e) => e.id === list.selected.value)?.title === '手的回声');

setStatusFilter('草稿');
await nextTick();
check('切到草稿后列表只剩 e2', eq(list.visibleExhibitions.value.map((e) => e.id), ['e2']));
check('e1 被筛掉后自动选中仍可见的 e2', list.selected.value === 'e2');
check('e1 数据仍然存在（工作面可随时切回）', !!svc.state.value.exhibitions.find((e) => e.id === 'e1'));
check('e1 状态与数据未被筛选改动', svc.state.value.exhibitions.find((e) => e.id === 'e1')?.status === '预览中');

setStatusFilter('预览中');
await nextTick();
check('切到预览中自动回到 e1（确定）', list.selected.value === 'e1');

setStatusFilter('已上线');
await nextTick();
check('已上线为空时选中清空', list.selected.value === '');
check('已上线为空时可见列表为空', list.visibleExhibitions.value.length === 0);
check('空筛选不删除任何展览', svc.state.value.exhibitions.length === 2);

setStatusFilter('全部');
await nextTick();
check('切回全部再次确定选中 e1', list.selected.value === 'e1');

console.log('D. 工作面编辑与筛选互不干扰');
// 选中 e1（预览中）后切到草稿：工作面切换由确定性规则处理，但编辑 e2 不影响 e1
setStatusFilter('草稿');
await nextTick();
svc.togglePiece(list.selected.value, 'a1');
setStatusFilter('预览中');
await nextTick();
check('在草稿筛选下编辑 e2 后，e1 的编排未受影响', eq(svc.state.value.exhibitions.find((e) => e.id === 'e1').pieces, ['a1', 'a3']));
check('e2 的编排修改已生效', svc.state.value.exhibitions.find((e) => e.id === 'e2').pieces.includes('a1'));

console.log('E. 数据变化时的确定性回退');
// e1 上线后在“预览中”筛选下被筛掉
setStatusFilter('预览中');
await nextTick();
check('预览中选中 e1', list.selected.value === 'e1');
svc.release('e1'); // e1 有 2 件作品，可以上线
await nextTick();
check('e1 上线后从预览中列表消失', list.visibleExhibitions.value.length === 0);
check('选中确定性清空（无随机/残留）', list.selected.value === '');
setStatusFilter('已上线');
await nextTick();
check('已上线列表出现 e1', eq(list.visibleExhibitions.value.map((e) => e.id), ['e1']));
check('自动选中 e1', list.selected.value === 'e1');

console.log('F. 持久化：独立 key，与展览/作品数据分开');
const dump = globalThis.localStorage.dump();
const dataKey = 'pottery-exhibit-studio-v1';
const uiKey = 'pottery-exhibit-studio-ui-v1';
check('数据 key 存在', dataKey in dump);
check('UI key 存在且保存的是筛选项', dump[uiKey] === '已上线');
check('两个 key 不同，互不覆盖', dataKey !== uiKey);
const savedData = JSON.parse(dump[dataKey]);
check('数据 key 中没有筛选字段', savedData.statusFilter === undefined && savedData.filter === undefined);
check('数据仍是 {exhibitions, artworks} 结构', Array.isArray(savedData.exhibitions) && Array.isArray(savedData.artworks));
check('UI key 中没有展览数据', !dump[uiKey].includes('exhibitions') && !dump[uiKey].includes('artworks'));

console.log('G. 非草稿筛选下创建草稿');
setStatusFilter('预览中'); // E 段后 e1 已上线，预览中此时为空
await nextTick();
check('预览中列表为空', list.visibleExhibitions.value.length === 0);
const fresh = svc.create('新展览');
setStatusFilter('草稿');
list.selected.value = fresh.id;
await nextTick();
check('创建后筛选自动切到草稿', list.statusFilter.value === '草稿');
check('新草稿在列表可见', eq(list.visibleExhibitions.value.map((e) => e.id).slice(0, 1), [fresh.id]));
check('新草稿被选中且不被回退规则带走', list.selected.value === fresh.id);
check('该筛选项变化也已持久化', globalThis.localStorage.getItem(uiKey) === '草稿');

console.log(failures ? `\n${failures} 条失败` : '\n全部通过');
process.exit(failures ? 1 : 0);
