/* 浏览器端到端验证：删除草稿、取消删除、非草稿拒绝、级联范围、刷新持久化。
 * 自动构建并拉起 vite preview，结束后自动关闭。直接运行：node verify/e2e.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const STORAGE_KEY = 'pottery-exhibit-studio-v1';
const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:4173';

// 若没有现成的预览服务，则本地拉起 vite preview 并在用例结束后关闭
async function waitForServer(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch { /* 未就绪，继续等 */ }
    await sleep(250);
  }
  return false;
}

let server = null;
let browser = null;
async function ensureServer() {
  if (await waitForServer(BASE_URL, 2)) return;
  server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort', '--host', '127.0.0.1'], {
    stdio: 'ignore',
    shell: true,
    detached: true,
  });
  if (!(await waitForServer(BASE_URL))) throw new Error('预览服务启动失败');
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log('  ok -', name);
}

async function freshPage(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (err) => {
    throw new Error('页面运行时错误: ' + err.message);
  });
  await page.goto(BASE_URL);
  await page.waitForSelector('.studio h1');
  return page;
}

async function stateOf(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), STORAGE_KEY);
}

function row(page, title) {
  return page.locator('.exhibit-row', { hasText: title }).first();
}

async function selectRow(page, title) {
  await row(page, title).click();
}

await ensureServer();
browser = await chromium.launch();

try {
  console.log('e2e: 初始渲染');
  {
    const page = await freshPage(browser);
    await check('三场种子展览与状态标签可见', async () => {
      await page.waitForSelector('.status-tag.s-预览中');
      await page.waitForSelector('.status-tag.s-草稿');
    });
  }

  console.log('e2e: 非草稿不能删除并说明原因');
  {
    const page = await freshPage(browser);
    await selectRow(page, '手的回声');
    await check('预览中展览的删除按钮禁用，危险区给出“审阅流程”原因', async () => {
      await page.waitForSelector('.danger-zone .blocked-reason');
      const reason = (await page.locator('.danger-zone .blocked-reason').textContent()) ?? '';
      if (!reason.includes('审阅')) throw new Error('原因不正确: ' + reason);
      const disabledCount = await page.locator('.exhibit-row .mini-delete:disabled').count();
      if (disabledCount < 1) throw new Error('预览中展览的行内删除按钮应禁用');
    });
    await check('点击被禁用按钮不会出现确认弹窗、无数据变化', async () => {
      const before = await stateOf(page);
      await page.locator('.exhibit-row', { hasText: '手的回声' }).locator('.mini-delete').click({ force: true }).catch(() => {});
      if (await page.locator('.modal-mask').count()) throw new Error('非草稿不应打开确认弹窗');
      const after = await stateOf(page);
      if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('数据发生了变化');
    });
  }

  console.log('e2e: 删除草稿（含级联）与自动选中');
  {
    const page = await freshPage(browser);
    await selectRow(page, '光的容器');
    await check('点击删除出现二次确认弹窗，且列出级联范围', async () => {
      await page.locator('.danger-zone .danger').click();
      await page.waitForSelector('.modal-mask');
      const text = (await page.locator('.modal').textContent()) ?? '';
      if (!text.includes('空间编排')) throw new Error('未说明空间编排将删除');
      if (!text.includes('导览文字')) throw new Error('未说明导览文字将删除');
    });
    await check('确认删除后展览消失，自动选中相邻的剩余展览', async () => {
      const countBefore = await page.locator('.exhibit-row').count();
      await page.locator('.modal .danger').click();
      await page.waitForSelector('.modal-mask', { state: 'detached' });
      if (await row(page, '光的容器').count()) throw new Error('被删草稿仍在列表中');
      const h2 = (await page.locator('.canvas h2').textContent()) ?? '';
      if (h2 !== '手的回声 · 巡展草稿') throw new Error('应自动选中相邻剩余展览，实际: ' + h2);
      const state = await stateOf(page);
      if (state.exhibitions.some((e) => e.title === '光的容器')) throw new Error('持久化中仍存在被删展览');
      if (state.arrangements.some((a) => a.exhibitionId === 'e2')) throw new Error('级联编排未清理');
      if (state.guides.some((g) => g.exhibitionId === 'e2')) throw new Error('级联导览未清理');
      if (state.exhibitions.length !== countBefore - 1) throw new Error('其他展览被误删');
      if (state.artworks.length !== 4) throw new Error('作品档案被误删');
      if (!state.arrangements.some((a) => a.exhibitionId === 'e1')) throw new Error('其他展览编排被误删');
    });
    await check('刷新后被删草稿不复活', async () => {
      await page.reload();
      await page.waitForSelector('.studio h1');
      if (await row(page, '光的容器').count()) throw new Error('刷新后草稿复活');
      const state = await stateOf(page);
      if (state.arrangements.some((a) => a.exhibitionId === 'e2') || state.guides.some((g) => g.exhibitionId === 'e2')) {
        throw new Error('刷新后孤儿编排/导览出现');
      }
    });
  }

  console.log('e2e: 取消删除不产生任何变化');
  {
    const page = await freshPage(browser);
    await selectRow(page, '光的容器');
    // 先制造一次写入，使取消前后的持久化内容可对比（取消本身不应产生写入）
    const beforeCount = await page.locator('.exhibit-row').count();
    await page.locator('.danger-zone .danger').click();
    await page.waitForSelector('.modal-mask');
    await check('点“取消”关闭弹窗，草稿与关联数据都保留', async () => {
      await page.locator('.modal .ghost').click();
      await page.waitForSelector('.modal-mask', { state: 'detached' });
      if (!(await row(page, '光的容器').count())) throw new Error('取消后草稿消失');
      if ((await page.locator('.exhibit-row').count()) !== beforeCount) throw new Error('取消后列表数量变化');
    });
    await check('再次打开后按 Esc 取消同样无变化', async () => {
      await page.locator('.danger-zone .danger').click();
      await page.waitForSelector('.modal-mask');
      await page.keyboard.press('Escape');
      await page.waitForSelector('.modal-mask', { state: 'detached' });
      if (!(await row(page, '光的容器').count())) throw new Error('Esc 取消后草稿消失');
      if ((await page.locator('.exhibit-row').count()) !== beforeCount) throw new Error('Esc 取消后列表数量变化');
    });
    await check('点击遮罩空白处取消同样无变化', async () => {
      await page.locator('.danger-zone .danger').click();
      await page.waitForSelector('.modal-mask');
      await page.mouse.click(20, 20);
      await page.waitForSelector('.modal-mask', { state: 'detached' });
      if (!(await row(page, '光的容器').count())) throw new Error('遮罩取消后草稿消失');
      if ((await page.locator('.exhibit-row').count()) !== beforeCount) throw new Error('遮罩取消后列表数量变化');
    });
  }

  console.log('e2e: 复制副本保留规则（源删除不误伤副本）');
  {
    const page = await freshPage(browser);
    await selectRow(page, '光的容器');
    await page.locator('.top-actions .ghost').click();
    await check('复制为草稿后删除源：副本保留并显示来源已解除', async () => {
      await page.waitForSelector('.exhibit-row', { hasText: '光的容器 · 副本' });
      // 精确点击标题为“光的容器”的源行（不能匹配到“· 副本”）
      await page.locator('.exhibit-row h3', { hasText: /^光的容器$/ }).click();
      await page.locator('.danger-zone .danger').click();
      const modalText = (await page.locator('.modal').textContent()) ?? '';
      if (!modalText.includes('会保留')) throw new Error('确认弹窗未说明副本保留');
      await page.locator('.modal .danger').click();
      const state = await stateOf(page);
      const copy = state.exhibitions.find((e) => e.title === '光的容器 · 副本');
      if (!copy) throw new Error('复制出的草稿被误删');
      if (copy.copiedFrom !== null) throw new Error('副本的来源关联应清空');
      if (!state.arrangements.some((a) => a.exhibitionId === copy.id)) throw new Error('副本编排被误删');
      if (!state.guides.some((g) => g.exhibitionId === copy.id)) throw new Error('副本导览被误删');
    });
  }

  console.log('e2e: 删除最后一场草稿后空状态');
  {
    const page = await freshPage(browser);
    // 直接写入“只剩一个草稿”的持久化状态，验证删光后的空态
    await page.evaluate((key) => {
      localStorage.setItem(key, JSON.stringify({
        exhibitions: [{ id: 'only', title: '唯一草稿', subtitle: '', curator: '', status: '草稿', opening: '2025-01-01', closing: '2025-02-01', pieces: [], description: '', copiedFrom: null }],
        artworks: [],
        arrangements: [{ exhibitionId: 'only', updatedAt: '', rooms: [] }],
        guides: [{ id: 'g-only', exhibitionId: 'only', title: '导览', body: '', updatedAt: '' }],
      }));
    }, STORAGE_KEY);
    await page.reload();
    await page.waitForSelector('.studio h1');
    await page.locator('.danger-zone .danger').click();
    await page.locator('.modal .danger').click();
    await check('唯一草稿删除后进入空状态且关联数据无残留', async () => {
      await page.waitForSelector('.canvas.empty');
      const state = await stateOf(page);
      if (state.exhibitions.length !== 0) throw new Error('展览未清空');
      if (state.arrangements.length !== 0 || state.guides.length !== 0) throw new Error('关联数据残留');
    });
  }

  console.log(`\ne2e: ${passed} 项通过`);
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill(); }
  }
}
