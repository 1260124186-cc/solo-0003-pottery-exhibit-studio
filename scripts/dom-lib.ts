// DOM 冒烟验证：挂载到 happy-dom，完全以用户视角操作下拉与点击。
// 覆盖：年份排序、作者筛选、组合、稳定性（二次挂载）、空结果提示、
// 清除恢复、切换展览保持、已保存顺序不被动、窄屏 CSS。
import { createApp, nextTick } from 'vue';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import StudioView from '../src/views/StudioView.vue';
// 与 SFC 是同一个模块 URL（经 loader 的 file 解析），ESM 单例共享 state
import { useExhibitService } from '../src/services/exhibitService';
import { artworks as seedArtworks } from '../src/domain/seed';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { state: svcState } = useExhibitService();
const localStorage = (globalThis as any).localStorage as Storage;
const document = (globalThis as any).document as Document;

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  createApp(StudioView).mount(host);
  return host;
}
function pieces(host: Element) {
  return [...host.querySelectorAll('.piece')] as HTMLElement[];
}
function titleOf(el: Element) {
  return el.querySelector('h3')!.textContent!.trim();
}
function pick(host: Element, label: string) {
  const sel = [...host.querySelectorAll('select')].find(
    (s) => (s.previousElementSibling?.textContent ?? '') === label,
  ) as HTMLSelectElement;
  if (!sel) throw new Error(`找不到下拉：${label}`);
  return sel;
}
async function choose(sel: HTMLSelectElement, value: string) {
  sel.value = value;
  sel.dispatchEvent(new (globalThis as any).window.Event('change', { bubbles: true }));
  await nextTick();
}
function exhibitRow(host: Element, title: string) {
  return [...host.querySelectorAll('.exhibit-row')].find((r) =>
    r.textContent!.includes(title),
  ) as HTMLElement;
}

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.error(`FAIL  ${name} ${detail}`);
  }
}

try {
  localStorage.clear();

  // ---------- 挂载 A：主流程 ----------
  const host = mount();
  await nextTick();

  check('两个下拉（排序/作者）都在', host.querySelectorAll('select').length === 2);
  check('排序选项齐全',
    pick(host, '排序').textContent!.replace(/\s+/g, '') === '按编排顺序年份从新到旧年份从旧到新');
  check('作者选项=全部+四位作者',
    pick(host, '作者').textContent!.replace(/\s+/g, '') === '全部作者林澄周野沈禾叶青');

  const initial = ['潮汐之后', '折光容器', '未完成的圆', '风从南方来'];
  check('初始网格 4 件且为档案顺序',
    JSON.stringify(pieces(host).map(titleOf)) === JSON.stringify(initial),
    JSON.stringify(pieces(host).map(titleOf)));
  const clearBtn = host.querySelector('.clear') as HTMLButtonElement;
  check('初始清除按钮禁用', clearBtn.disabled);

  // 1) 年份降序：2024 的 a1、a3 稳定保持档案次序，然后 a2(2023)、a4(2022)
  await choose(pick(host, '排序'), 'year-desc');
  check('年份从新到旧，同年并列稳定（a1 在 a3 前）',
    JSON.stringify(pieces(host).map(titleOf))
      === JSON.stringify(['潮汐之后', '未完成的圆', '折光容器', '风从南方来']),
    JSON.stringify(pieces(host).map(titleOf)));
  check('生效后清除按钮可点击', !clearBtn.disabled);
  check('结果计数 4/4', host.textContent!.includes('显示 4 / 4 件'));

  // 2) 年份升序
  await choose(pick(host, '排序'), 'year-asc');
  check('年份从旧到新（a4 2022 最前）', titleOf(pieces(host)[0]) === '风从南方来');

  // 3) 作者筛选：种子里每位作者恰好一件，林澄 → 仅 a1
  await choose(pick(host, '排序'), 'default');
  await choose(pick(host, '作者'), '林澄');
  check('筛选林澄只剩 a1 一件',
    JSON.stringify(pieces(host).map(titleOf)) === JSON.stringify(['潮汐之后']),
    JSON.stringify(pieces(host).map(titleOf)));
  check('筛选计数 1/4', host.textContent!.includes('显示 1 / 4 件'));

  // 4) 组合：作者筛选 + 年份排序同时作用，只显示该作者作品
  await choose(pick(host, '排序'), 'year-desc');
  check('组合：林澄+年份降序仍只显示 a1',
    JSON.stringify(pieces(host).map(titleOf)) === JSON.stringify(['潮汐之后']));
  await choose(pick(host, '作者'), '叶青');
  check('组合：叶青（2022 年）+ 年份降序，只显示 a4 且不混入他人作品',
    pieces(host).length === 1 && titleOf(pieces(host)[0]) === '风从南方来');

  // 5) 切换展览：点击左侧「光的容器」，筛选与排序状态必须保持
  exhibitRow(host, '光的容器').click();
  await nextTick();
  check('切换展览后工作面标题变更', host.querySelector('h2')!.textContent === '光的容器');
  check('切换展览后筛选+排序仍然生效（仍只有 a4）',
    pieces(host).length === 1 && titleOf(pieces(host)[0]) === '风从南方来',
    JSON.stringify(pieces(host).map(titleOf)));
  check('切换展览后下拉值保持（year-desc / 叶青）',
    pick(host, '排序').value === 'year-desc' && pick(host, '作者').value === '叶青');

  // 6) 空结果：作者筛选仍在时档案变化（该作者作品撤空）→ 明确空态
  await choose(pick(host, '作者'), '周野');
  check('筛选周野为 1 件', pieces(host).length === 1 && titleOf(pieces(host)[0]) === '折光容器');
  svcState.value.artworks = svcState.value.artworks.filter((a) => a.artist !== '周野');
  await nextTick();
  check('空结果时网格消失、空态提示与恢复入口出现',
    host.querySelectorAll('.piece-grid').length === 0
      && host.textContent!.includes('当前筛选下没有作品'));
  check('空态含针对当前作者的说明', host.textContent!.includes('作者「周野」暂无作品'));
  (host.querySelector('.empty-state button') as HTMLButtonElement).click();
  await nextTick();
  check('从空态清除后恢复剩余全部作品（3 件）', pieces(host).length === 3);
  check('清除后不再有空态', host.querySelectorAll('.empty-state').length === 0);

  // 恢复完整档案继续后续验证
  svcState.value.artworks = [...seedArtworks];
  await nextTick();

  // 7) 再次清除：恢复全部 4 件、默认顺序、按钮重新禁用
  clearBtn.click();
  await nextTick();
  check('清除后恢复 4 件', pieces(host).length === 4);
  check('清除后回到档案顺序',
    JSON.stringify(pieces(host).map(titleOf)) === JSON.stringify(initial));
  check('清除后两个下拉复位',
    pick(host, '排序').value === 'default' && pick(host, '作者').value === '');
  check('清除后按钮重新禁用', clearBtn.disabled);
  check('计数复位 4/4', host.textContent!.includes('显示 4 / 4 件'));

  // 8) 已保存顺序不被动：排序/筛选全程不应修改两个展览的 pieces 顺序
  const e2 = svcState.value.exhibitions.find((e) => e.title === '光的容器');
  const e1 = svcState.value.exhibitions.find((e) => e.title === '手的回声');
  check('两展览已保存 pieces 顺序不变（内存）',
    JSON.stringify(e2.pieces) === JSON.stringify(['a2', 'a4'])
      && JSON.stringify(e1.pieces) === JSON.stringify(['a1', 'a3']),
    `${JSON.stringify(e2.pieces)} / ${JSON.stringify(e1.pieces)}`);

  // 9) 排序视图下操作作品仍然正确（展示与编排不打架）
  exhibitRow(host, '手的回声').click();
  await nextTick();
  await choose(pick(host, '排序'), 'year-desc');
  const a1Card = pieces(host).find((p) => titleOf(p) === '潮汐之后')!;
  const before = e1.pieces.slice();
  a1Card.click();
  await nextTick();
  check('排序视图下点击作品，切换的是正确的展览 pieces（a1 被移除）',
    JSON.stringify(before) === JSON.stringify(['a1', 'a3'])
      && JSON.stringify(e1.pieces) === JSON.stringify(['a3']),
    JSON.stringify(e1.pieces));
  a1Card.click(); // 复原
  await nextTick();
  check('再次点击恢复，已保存顺序回到原样', JSON.stringify(e1.pieces) === JSON.stringify(['a1', 'a3']));

  // 卡片内按钮点击不得冒泡导致切换两次（基线 bug）：点按钮一次只移除 a1
  const a1Button = a1Card.querySelector('button') as HTMLButtonElement;
  a1Button.click();
  await nextTick();
  check('点击卡片内按钮只切换一次（不冒泡双触发）',
    JSON.stringify(e1.pieces) === JSON.stringify(['a3']), JSON.stringify(e1.pieces));
  a1Button.click();
  await nextTick();
  check('再点按钮恢复且顺序不变', JSON.stringify(e1.pieces) === JSON.stringify(['a1', 'a3']));

  // ---------- 挂载 B：模拟整页刷新，同年并列顺序不变 ----------
  localStorage.clear();
  const host2 = mount();
  await nextTick();
  await choose(pick(host2, '排序'), 'year-desc');
  check('重新挂载（刷新）后年份降序顺序完全一致',
    JSON.stringify(pieces(host2).map(titleOf))
      === JSON.stringify(['潮汐之后', '未完成的圆', '折光容器', '风从南方来']),
    JSON.stringify(pieces(host2).map(titleOf)));

  // ---------- 空态与窄屏：SFC 源码检查（DOM 已在步骤 6 实证空态）----------
  const sfc = readFileSync(path.join(root, 'src/views/StudioView.vue'), 'utf8');
  check('空结果有明确提示与恢复入口',
    sfc.includes('当前筛选下没有作品') && sfc.includes('class="empty-state"'));
  check('窄屏下控件纵向铺满、可触摸',
    sfc.includes('max-width: 800px') && sfc.includes('min-height: 44px')
      && sfc.includes('flex-direction: column'));

  if (failures) {
    console.error(`\n${failures} 项失败`);
    process.exit(1);
  }
  console.log('\nDOM 组件验证全部通过');
} catch (err) {
  console.error(err);
  process.exit(1);
}
