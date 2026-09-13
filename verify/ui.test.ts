/* 真实挂载 StudioView 的 UI 集成验证（happy-dom）：确认弹窗、取消零变化、非草稿阻断、级联与刷新。 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';

const STORAGE_KEY = 'pottery-exhibit-studio-v1';

async function mountStudio(): Promise<VueWrapper<any>> {
  localStorage.clear();
  vi.resetModules();
  const mod = await import('../src/views/StudioView.vue');
  return mount(mod.default, { attachTo: document.body });
}

function stored(): any {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
}

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe('界面：非草稿不可删除并说明原因', () => {
  test('选中预览中展览：行内按钮禁用，危险区显示审阅原因', async () => {
    const w = await mountStudio();
    await w.findAll('.exhibit-row')[0].trigger('click'); // e1 预览中
    await w.vm.$nextTick();
    expect(w.find('.danger-zone .blocked-reason').text()).toContain('审阅');
    const disabled = w.findAll('.exhibit-row .mini-delete').filter((b) => b.attributes('disabled') !== undefined);
    expect(disabled.length).toBe(1);
    expect(w.find('.danger-zone .danger').attributes('disabled')).toBeDefined();
  });
});

describe('界面：删除草稿 + 二次确认 + 自动选中', () => {
  test('取消（按钮/Esc/遮罩）都不产生任何变化', async () => {
    const w = await mountStudio();
    // 选中 e2 草稿（列表顺序 e1,e2,e3）
    const rows = w.findAll('.exhibit-row');
    await rows[1].trigger('click');

    // 方式一：取消按钮
    await w.find('.danger-zone .danger').trigger('click');
    expect(w.find('.modal-mask').exists()).toBe(true);
    await w.find('.modal .ghost').trigger('click');
    expect(w.find('.modal-mask').exists()).toBe(false);
    expect(w.text()).toContain('光的容器');
    expect(stored()).toBeNull(); // 未做任何写操作

    // 方式二：Esc
    await w.find('.danger-zone .danger').trigger('click');
    expect(w.find('.modal-mask').exists()).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await w.vm.$nextTick();
    expect(w.find('.modal-mask').exists()).toBe(false);
    expect(w.text()).toContain('光的容器');

    // 方式三：点击遮罩自身
    await w.find('.danger-zone .danger').trigger('click');
    expect(w.find('.modal-mask').exists()).toBe(true);
    await w.find('.modal-mask').trigger('click.self');
    expect(w.find('.modal-mask').exists()).toBe(false);
    expect(w.text()).toContain('光的容器');
    expect(stored()).toBeNull();
  });

  test('确认删除：展览及其编排/导览清除，副本保留，自动选中相邻展览，已持久化', async () => {
    const w = await mountStudio();
    await w.findAll('.exhibit-row')[1].trigger('click');

    await w.find('.danger-zone .danger').trigger('click');
    const modalText = w.find('.modal').text();
    expect(modalText).toContain('空间编排');
    expect(modalText).toContain('导览文字');
    expect(modalText).toContain('作品档案和其他展览不受影响');
    expect(modalText).toContain('没有由它复制出的草稿');

    await w.find('.modal .danger').trigger('click');
    await w.vm.$nextTick();

    expect(w.find('.modal-mask').exists()).toBe(false);
    expect(w.text()).not.toContain('光的容器');
    // 自动选中相邻的 e3
    expect(w.find('.canvas h2').text()).toBe('手的回声 · 巡展草稿');

    const s = stored();
    expect(s.exhibitions.map((e: any) => e.id)).toEqual(['e1', 'e3']);
    expect(s.arrangements.map((a: any) => a.exhibitionId).sort()).toEqual(['e1', 'e3']);
    expect(s.guides.map((g: any) => g.exhibitionId).sort()).toEqual(['e1', 'e3']);
    expect(s.artworks).toHaveLength(4);
  });

  test('刷新（重新挂载并从 localStorage 读取）后草稿不复活', async () => {
    let w = await mountStudio();
    await w.findAll('.exhibit-row')[1].trigger('click');
    await w.find('.danger-zone .danger').trigger('click');
    await w.find('.modal .danger').trigger('click');
    await w.vm.$nextTick();

    // 模拟刷新：不清除存储，重置模块后重新挂载
    vi.resetModules();
    const mod = await import('../src/views/StudioView.vue');
    w = mount(mod.default, { attachTo: document.body });
    await w.vm.$nextTick();
    expect(w.text()).not.toContain('光的容器');
    expect(w.findAll('.exhibit-row')).toHaveLength(2);
  });
});

describe('界面：复制出的草稿不被误伤', () => {
  test('弹窗说明保留副本；删除源后副本保留且来源解除', async () => {
    const w = await mountStudio();
    // 选中 e2 并复制为草稿
    await w.findAll('.exhibit-row')[1].trigger('click');
    await w.find('.top-actions .ghost').trigger('click');
    await w.vm.$nextTick();

    // 复制后列表顺序：副本、e1、e2、e3；用标题精确选择源行（排除“副本”）
    const sourceTitle = w
      .findAll('.exhibit-row h3')
      .find((h) => h.text() === '光的容器')!;
    await sourceTitle.trigger('click'); // 点击事件冒泡到行
    await w.vm.$nextTick();

    await w.find('.danger-zone .danger').trigger('click');
    expect(w.find('.modal').text()).toContain('会保留');
    await w.find('.modal .danger').trigger('click');
    await w.vm.$nextTick();

    const s = stored();
    const copy = s.exhibitions.find((e: any) => e.title === '光的容器 · 副本');
    expect(copy).toBeTruthy();
    expect(copy.copiedFrom).toBeNull();
    expect(s.arrangements.some((a: any) => a.exhibitionId === copy.id)).toBe(true);
    expect(s.guides.some((g: any) => g.exhibitionId === copy.id)).toBe(true);
    expect(s.exhibitions.some((e: any) => e.title === '光的容器' && e.id !== copy.id)).toBe(false);
  });
});
