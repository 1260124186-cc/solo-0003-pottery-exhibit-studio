// 纯逻辑验证：usePieceBrowser 的排序/筛选/稳定性/清除/切换展览
// 用 tsc 从项目源码转译后运行，不引入测试框架。
import { ref, nextTick } from 'vue';
import type { Artwork } from '../src/domain/models';
import { usePieceBrowser } from '../src/composables/usePieceBrowser';

// 刻意构造同年份并列、同作者并列，以检验稳定性
const artworks: Artwork[] = [
  { id: 'a1', title: '潮汐之后', artist: '林澄', material: '白瓷', year: 2024, note: '', tone: '#1' },
  { id: 'a2', title: '折光容器', artist: '周野', material: '粗陶', year: 2023, note: '', tone: '#2' },
  { id: 'a3', title: '未完成的圆', artist: '林澄', material: '炻器', year: 2024, note: '', tone: '#3' },
  { id: 'a4', title: '风从南方来', artist: '叶青', material: '瓷板', year: 2022, note: '', tone: '#4' },
  { id: 'a5', title: '泥火之春', artist: '林澄', material: '青瓷', year: 2022, note: '', tone: '#5' },
];

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`PASS  ${name}`);
  } else {
    failures++;
    console.error(`FAIL  ${name} ${detail}`);
  }
}
function ids(rows: Artwork[]) {
  return rows.map((a) => a.id).join(',');
}

const source = ref<Artwork[]>([...artworks]);
const sortMode = ref<any>('default');
const artistFilter = ref('');
const { visiblePieces, artists, isFiltering } = usePieceBrowser(source, sortMode, artistFilter);

// 1. 默认：按档案/编排顺序展示全部
check('默认显示全部且为档案顺序', ids(visiblePieces.value) === 'a1,a2,a3,a4,a5', ids(visiblePieces.value));
check('默认状态 isFiltering=false', isFiltering.value === false);

// 2. 年份降序：a1/a3(2024并列) 必须保持档案相对顺序
sortMode.value = 'year-desc';
check(
  '年份降序，同年份稳定保持档案次序',
  ids(visiblePieces.value) === 'a1,a3,a2,a4,a5',
  ids(visiblePieces.value),
);
check('排序后 isFiltering=true', isFiltering.value === true);

// 3. 年份升序：a4/a5(2022并列) 保持档案次序 a4 在 a5 前
sortMode.value = 'year-asc';
check(
  '年份升序，同年份稳定保持档案次序',
  ids(visiblePieces.value) === 'a4,a5,a2,a1,a3',
  ids(visiblePieces.value),
);

// 4. 稳定性：重复读取与“刷新”（重新创建组合式）结果一致
const run2 = ids(visiblePieces.value);
const run3 = ids(usePieceBrowser(source, sortMode, artistFilter).visiblePieces.value);
check('重复计算结果一致（不跳动）', run2 === run3 && run2 === 'a4,a5,a2,a1,a3', `${run2} vs ${run3}`);

// 5. 按作者筛选：林澄 = a1,a3,a5，且保持档案顺序
sortMode.value = 'default';
artistFilter.value = '林澄';
check('按作者筛选，档案次序稳定', ids(visiblePieces.value) === 'a1,a3,a5', ids(visiblePieces.value));

// 6. 组合：作者=林澄 + 年份降序 => 2024 的 a1,a3（保持档案次序）在前，a5(2022) 在后
sortMode.value = 'year-desc';
check(
  '筛选+排序组合：林澄 年份降序',
  ids(visiblePieces.value) === 'a1,a3,a5',
  ids(visiblePieces.value),
);

// 7. 组合稳定性：切换多次排序方向再回来，结果一致
sortMode.value = 'year-asc';
sortMode.value = 'year-desc';
check('组合状态反复切换后结果一致', ids(visiblePieces.value) === 'a1,a3,a5', ids(visiblePieces.value));

// 8. 空结果：筛选不存在的作者
artistFilter.value = '不存在的作者';
check('无匹配作者时结果为空', visiblePieces.value.length === 0);

// 9. 清除：恢复全部作品、回到编排顺序
sortMode.value = 'default';
artistFilter.value = '';
check('清除后恢复全部作品与档案顺序', ids(visiblePieces.value) === 'a1,a2,a3,a4,a5', ids(visiblePieces.value));
check('清除后 isFiltering=false', isFiltering.value === false);

// 10. 切换展览：筛选/排序是工作面状态，切走再切回仍生效（状态不随展览重置）
//     两个展览各自保存的 pieces 顺序在整个过程中都不能被动到
const exhibitionA = ['a3', 'a1', 'a5'];
const exhibitionB = ['a2', 'a4'];
let activeExhibition = exhibitionA;
sortMode.value = 'year-desc';
artistFilter.value = '叶青';
const beforeSwitch = ids(visiblePieces.value);
activeExhibition = exhibitionB; // 模拟在工作面切到另一场展览
await nextTick();
const afterSwitch = ids(visiblePieces.value);
check('切换展览时筛选与排序仍然生效', beforeSwitch === afterSwitch && afterSwitch === 'a4', afterSwitch);
activeExhibition = exhibitionA; // 切回
await nextTick();
check('切回原展览筛选排序依旧生效', ids(visiblePieces.value) === 'a4', ids(visiblePieces.value));

// 11. 排序/筛选绝不修改源档案顺序与两个展览已保存的作品顺序
check('源档案顺序未被改变', ids(source.value) === 'a1,a2,a3,a4,a5', ids(source.value));
check(
  '两个展览 pieces 已保存顺序均未被改变',
  JSON.stringify(exhibitionA) === JSON.stringify(['a3', 'a1', 'a5'])
    && JSON.stringify(exhibitionB) === JSON.stringify(['a2', 'a4']),
  `${JSON.stringify(exhibitionA)} / ${JSON.stringify(exhibitionB)}`,
);


// 12. 作者名单稳定（按首次出现次序）
check('作者选项按档案首次出现次序稳定', artists.value.join('|') === '林澄|周野|叶青', artists.value.join('|'));

// 13. 档案数据变化（新增作品）后视图自动派生，且并列项仍稳定
artistFilter.value = '';
sortMode.value = 'default';
source.value = [
  ...artworks,
  { id: 'a6', title: '新器', artist: '林澄', material: '陶', year: 2024, note: '', tone: '#6' },
];
check('新增作品默认追加在末尾（视图派生，无需手动同步）', ids(visiblePieces.value) === 'a1,a2,a3,a4,a5,a6', ids(visiblePieces.value));
sortMode.value = 'year-desc';
check('新增同年作品稳定排到并列组末尾', ids(visiblePieces.value) === 'a1,a3,a6,a2,a4,a5', ids(visiblePieces.value));

if (failures) {
  console.error(`\n${failures} 项失败`);
  process.exit(1);
}
console.log('\n全部通过');
