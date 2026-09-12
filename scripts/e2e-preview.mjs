import { chromium } from 'playwright';

const BASE = 'http://localhost:4173/';
let passed = 0;
function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log('  PASS  ' + name);
  } else {
    console.log('  FAIL  ' + name + (extra ? '  >>> ' + extra : ''));
    process.exitCode = 1;
  }
}

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => {
  console.log('  FAIL  page error: ' + e.message);
  process.exitCode = 1;
});

// ---- 快照：策展数据在新功能使用前后结构必须完全不变 ----
await page.goto(BASE);
await page.waitForSelector('.studio');
// 首次加载时数据只在内存中（既有行为：首次变更才写入 localStorage）。
// 对一件不在当前展览中的作品切换两次（加入再移出），触发落盘且 pieces 原数组与顺序不变。
await page.locator('.piece').filter({ hasText: '折光容器' }).click();
await page.locator('.piece').filter({ hasText: '折光容器' }).click();
await page.waitForFunction(() => localStorage.getItem('pottery-exhibit-studio-v1'));
const studioBefore = await page.evaluate(() => localStorage.getItem('pottery-exhibit-studio-v1'));
const studioBeforeParsed = JSON.parse(studioBefore);
check('初始本地存储含 2 场展览 4 件作品',
  studioBeforeParsed.exhibitions.length === 2 && studioBeforeParsed.artworks.length === 4);

// ============ 1. 进入预览：展览信息 + 首件（按加入顺序） ============
console.log('\n[1] 从当前展览进入观众预览');
await page.getByRole('button', { name: '以观众视角预览' }).first().click();
await page.waitForURL(/#\/preview\/e1$/);
check('URL 进入 #/preview/e1', page.url().endsWith('#/preview/e1'));
await page.waitForSelector('.tour');
check('显示展览名称', (await page.locator('.tour-head h1').textContent()).trim() === '手的回声');
check('显示副标题', (await page.locator('.tour-head .subtitle').textContent()).includes('当泥土记住每一次触碰'));
const hours = await page.locator('.tour-head .hours').textContent();
check('显示开放时间', hours.includes('2024-09-12') && hours.includes('2024-11-30'), hours);

let title = (await page.locator('.piece-body h2').textContent()).trim();
check('首件按加入顺序为 a1《潮汐之后》', title === '潮汐之后', title);
let attrib = await page.locator('.attrib').textContent();
check('显示作者/材质/年份', attrib.includes('林澄') && attrib.includes('白瓷·盐釉') && attrib.includes('2024'), attrib);
check('显示作品说明', (await page.locator('.note').textContent()).includes('釉面留下潮线般的自然纹理'));
check('计数器 1/2', (await page.locator('.counter').textContent()).includes('1 / 2'));

// ============ 2. 逐件浏览 + 末件回到首件 ============
console.log('\n[2] 上一件 / 下一件 / 循环');
await page.getByRole('button', { name: /下一件/ }).click();
check('下一件为《未完成的圆》', (await page.locator('.piece-body h2').textContent()).trim() === '未完成的圆');
check('计数器 2/2', (await page.locator('.counter').textContent()).includes('2 / 2'));
let wrapBtn = page.getByRole('button', { name: '回到第一件 →' });
check('末件按钮文案为“回到第一件”', await wrapBtn.count() === 1);
await wrapBtn.click();
check('回到第一件《潮汐之后》', (await page.locator('.piece-body h2').textContent()).trim() === '潮汐之后');
check('计数器回到 1/2', (await page.locator('.counter').textContent()).includes('1 / 2'));
await page.getByRole('button', { name: /上一件/ }).click();
check('首件点“上一件”循环到末件', (await page.locator('.piece-body h2').textContent()).trim() === '未完成的圆');

// ============ 3. 观众导览词：撰写、保存、一一对应、刷新保留 ============
console.log('\n[3] 导览词撰写与持久化');
check('未撰写时显示空态', (await page.locator('.narration-empty').textContent()).includes('尚未'));
await page.getByRole('button', { name: '撰写导览词' }).click();
await page.locator('.narration textarea').fill('【a3 导览】请注意器身上保留的拉坯指痕，那是创作者与泥土直接对话的证据。');
await page.getByRole('button', { name: '保存导览词' }).click();
await page.waitForSelector('.saved-hint');
check('保存后成段展示导览词', (await page.locator('.narration-text').textContent()).includes('拉坯指痕'));

await page.locator('.tour-nav .primary').click(); // 末件的“回到第一件”回到 a1
check('另一件仍为空态（一一对应，互不串用）', await page.locator('.narration-empty').count() === 1);
await page.getByRole('button', { name: '撰写导览词' }).click();
await page.locator('.narration textarea').fill('【a1 导览】盐釉在高温下自然流淌，留下的潮线记录了窑火与时间的共同作用。');
await page.getByRole('button', { name: '保存导览词' }).click();

const narrRaw = await page.evaluate(() => localStorage.getItem('pottery-exhibit-narratives-v1'));
const narr = JSON.parse(narrRaw);
check('导览词保存在独立命名空间 pottery-exhibit-narratives-v1', !!(narr.a1 && narr.a3));
check('导览词与作品 id 一一对应', narr.a1.includes('a1 导览') && narr.a3.includes('a3 导览'));

await page.reload();
await page.waitForSelector('.tour');
check('刷新后仍停留在预览页', page.url().includes('#/preview/'));
check('刷新后 a1 导览词保留', (await page.locator('.narration-text').textContent()).includes('潮线记录'));
await page.locator('.tour-nav .primary').click();
check('刷新后 a3 导览词保留', (await page.locator('.narration-text').textContent()).includes('拉坯指痕'));

// ============ 4. 空展览：无法开始导览 ============
console.log('\n[4] 空展览提示');
await page.locator('.back').click();
await page.waitForSelector('.studio');
await page.locator('.new-box input').fill('空白测试展');
await page.getByRole('button', { name: '创建草稿' }).click();
await page.getByRole('button', { name: '以观众视角预览' }).first().click();
await page.waitForSelector('.empty-tour');
check('空展览显示无法开始导览', (await page.locator('.empty-tour h2').textContent()).includes('暂时无法开始导览'));
check('空展览不显示作品卡', await page.locator('.piece-card').count() === 0);
check('空展览不显示上一件/下一件', await page.locator('.tour-nav').count() === 0);
// 空展览页直接刷新，仍应正确处理
await page.reload();
check('空展览刷新后仍显示无法开始导览', await page.locator('.empty-tour h2').count() === 1);

// ============ 5. 加入顺序 + 返回策展 + 上线流程不受影响 ============
console.log('\n[5] 加入顺序与既有流程回归');
await page.locator('.empty-tour .back, .preview-header .back').first().click();
await page.waitForSelector('.studio');
// 给空白展加入作品，顺序：风从南方来(a4) -> 折光容器(a2)
const rows = page.locator('.piece');
await rows.filter({ hasText: '风从南方来' }).click();
await rows.filter({ hasText: '折光容器' }).click();
await page.getByRole('button', { name: '以观众视角预览' }).first().click();
await page.waitForSelector('.tour');
check('按加入顺序首件为《风从南方来》', (await page.locator('.piece-body h2').textContent()).trim() === '风从南方来');
await page.getByRole('button', { name: /下一件/ }).click();
check('第二件为《折光容器》', (await page.locator('.piece-body h2').textContent()).trim() === '折光容器');
await page.getByRole('button', { name: '回到第一件 →' }).click();

await page.locator('.back').click();
await page.waitForSelector('.studio');
await page.getByRole('button', { name: '上线展览' }).click();
await page.waitForFunction(() => document.querySelector('.notice')?.textContent.includes('展览已上线'));
check('上线流程正常', (await page.locator('.notice').textContent()).includes('展览已上线'));

// ============ 6. 隔离性：策展数据结构与初始形态保持一致 ============
console.log('\n[6] 数据隔离');
const studioAfter = JSON.parse(await page.evaluate(() => localStorage.getItem('pottery-exhibit-studio-v1')));
const shape = (o) => JSON.parse(JSON.stringify(o, (k, v) => (Array.isArray(v) ? `array:${v.length}` : v)));
const newEx = studioAfter.exhibitions.find((e) => e.title === '空白测试展');
check('新建展览只含既有字段（无导览词污染）',
  JSON.stringify(Object.keys(newEx).sort()) === JSON.stringify(['closing','curator','description','id','opening','pieces','status','subtitle','title'].sort()));
check('作品记录未被新增字段', studioAfter.artworks.every((a) =>
  JSON.stringify(Object.keys(a).sort()) === JSON.stringify(['artist','id','material','note','title','tone','year'].sort())));
const e1after = studioAfter.exhibitions.find((e) => e.id === 'e1');
const e1before = studioBeforeParsed.exhibitions.find((e) => e.id === 'e1');
check('未被编辑的展览数据与使用前完全一致', JSON.stringify(e1after) === JSON.stringify(e1before));
check('原始两场展的 pieces 顺序未变',
  JSON.stringify(e1after.pieces) === JSON.stringify(['a1','a3']) &&
  JSON.stringify(studioAfter.exhibitions.find(e=>e.id==='e2').pieces) === JSON.stringify(['a2','a4']));
check('上线只改状态：空白测试展变为已上线', newEx.status === '已上线');

await browser.close();
console.log(`\n结果：${passed} 项检查全部通过` + (process.exitCode ? '，存在失败项' : ''));
