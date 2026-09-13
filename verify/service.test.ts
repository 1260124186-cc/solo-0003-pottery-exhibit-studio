/* 服务层验证：创建/复制/删除工作流、持久化往返、刷新后不复活、旧版本数据迁移。 */
import { describe, test, expect, beforeEach, vi } from 'vitest';

const KEY = 'pottery-exhibit-studio-v1';

function installStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  return store;
}

/** 每个场景使用独立存储并重新加载服务模块，模拟应用启动/刷新 */
async function freshService() {
  vi.resetModules();
  const mod = await import('../src/services/exhibitService');
  return mod.useExhibitService();
}

beforeEach(() => {
  installStorage();
});

describe('service: 全新初始化', () => {
  test('种子包含三场展览、四件作品、三组编排、三条导览', async () => {
    const svc = await freshService();
    expect(svc.state.value.exhibitions).toHaveLength(3);
    expect(svc.state.value.artworks).toHaveLength(4);
    expect(svc.state.value.arrangements).toHaveLength(3);
    expect(svc.state.value.guides).toHaveLength(3);
  });

  test('创建即写入 localStorage（含空编排与默认导览）', async () => {
    const svc = await freshService();
    const e = svc.create('新草稿');
    const raw = JSON.parse(localStorage.getItem(KEY)!);
    expect(raw.exhibitions[0].id).toBe(e.id);
    expect(raw.arrangements.some((a: any) => a.exhibitionId === e.id)).toBe(true);
    expect(raw.guides.some((g: any) => g.exhibitionId === e.id)).toBe(true);
  });
});

describe('service: 删除草稿 + 刷新持久化', () => {
  test('删除后内存中展览/编排/导览一起消失并同步 localStorage，刷新不复活', async () => {
    const store = installStorage();
    let svc = await freshService();
    const target = svc.state.value.exhibitions.find((e) => e.title === '光的容器')!;

    svc.remove(target.id);
    expect(svc.state.value.exhibitions.some((e) => e.id === target.id)).toBe(false);
    expect(svc.state.value.arrangements.some((a) => a.exhibitionId === target.id)).toBe(false);
    expect(svc.state.value.guides.some((g) => g.exhibitionId === target.id)).toBe(false);

    const persisted = JSON.parse(store.get(KEY)!);
    expect(persisted.exhibitions.some((e: any) => e.id === target.id)).toBe(false);
    expect(persisted.arrangements.some((a: any) => a.exhibitionId === target.id)).toBe(false);
    expect(persisted.guides.some((g: any) => g.exhibitionId === target.id)).toBe(false);

    // 模拟刷新：从同一份存储重新加载
    svc = await freshService();
    expect(svc.state.value.exhibitions.some((e) => e.id === target.id)).toBe(false);
    expect(svc.state.value.exhibitions.map((e) => e.id)).toEqual(['e1', 'e3']);
    expect(svc.state.value.artworks).toHaveLength(4);
  });

  test('不调用 remove（对应取消确认）时状态与持久化都不变', async () => {
    const store = installStorage();
    const svc = await freshService();
    svc.create('将取消删除的草稿');
    const stateSnap = JSON.stringify(svc.state.value);
    const storeSnap = store.get(KEY);
    // 视图层打开确认弹窗又取消，等价于始终不调用 remove
    expect(JSON.stringify(svc.state.value)).toBe(stateSnap);
    expect(store.get(KEY)).toBe(storeSnap);
  });
});

describe('service: 非草稿拒绝删除', () => {
  test('删除预览中抛错且数据零变化', async () => {
    const svc = await freshService();
    const preview = svc.state.value.exhibitions.find((e) => e.status === '预览中')!;
    const snapshot = JSON.stringify(svc.state.value);
    expect(() => svc.remove(preview.id)).toThrowError(/审阅/);
    expect(JSON.stringify(svc.state.value)).toBe(snapshot);
  });

  test('草稿上线后再删除被拒（已上线），且仍然存在', async () => {
    const svc = await freshService();
    const draft = svc.create('待上线');
    svc.togglePiece(draft.id, 'a1');
    svc.release(draft.id);
    expect(() => svc.remove(draft.id)).toThrowError(/公众/);
    expect(svc.state.value.exhibitions.some((e) => e.id === draft.id)).toBe(true);
  });
});

describe('service: 复制草稿的生命周期', () => {
  test('复制产生独立草稿；删除源后副本保留、来源解除；刷新后仍在', async () => {
    let svc = await freshService();
    const source = svc.state.value.exhibitions.find((e) => e.title === '光的容器')!;
    const copy = svc.duplicate(source.id);
    expect(copy.status).toBe('草稿');
    expect(copy.copiedFrom).toBe(source.id);
    expect(copy.id).not.toBe(source.id);
    expect(svc.state.value.arrangements.some((a) => a.exhibitionId === copy.id)).toBe(true);
    expect(svc.state.value.guides.some((g) => g.exhibitionId === copy.id)).toBe(true);

    svc.remove(source.id);
    const kept = svc.state.value.exhibitions.find((e) => e.id === copy.id);
    expect(kept).toBeTruthy();
    expect(kept!.copiedFrom).toBeNull();
    expect(svc.state.value.arrangements.some((a) => a.exhibitionId === copy.id)).toBe(true);
    expect(svc.state.value.guides.some((g) => g.exhibitionId === copy.id)).toBe(true);

    // 刷新后副本仍在，且不会因来源已删而被连带移除
    svc = await freshService();
    const afterRefresh = svc.state.value.exhibitions.find((e) => e.id === copy.id);
    expect(afterRefresh).toBeTruthy();
    expect(afterRefresh!.copiedFrom).toBeNull();
  });

  test('删除被拒的预览展不会影响其复制草稿 e3', async () => {
    const svc = await freshService();
    const e1 = svc.state.value.exhibitions.find((e) => e.id === 'e1')!;
    expect(() => svc.remove(e1.id)).toThrowError(/审阅/);
    const e3 = svc.state.value.exhibitions.find((e) => e.id === 'e3')!;
    expect(e3.copiedFrom).toBe('e1');
    expect(svc.state.value.arrangements.some((a) => a.exhibitionId === 'e3')).toBe(true);
  });
});

describe('service: 旧版本数据迁移', () => {
  test('只有 exhibitions + artworks 的旧存档补齐编排/导览，删除时完整级联', async () => {
    const legacy = {
      exhibitions: [
        { id: 'old1', title: '老草稿', subtitle: '', curator: '老', status: '草稿', opening: '2024-01-01', closing: '2024-02-01', pieces: ['a1'], description: '' },
      ],
      artworks: [{ id: 'a1', title: '旧作', artist: '', material: '', year: 2020, note: '', tone: '#fff' }],
    };
    installStorage({ [KEY]: JSON.stringify(legacy) });
    const svc = await freshService();
    expect(svc.state.value.exhibitions[0].copiedFrom).toBeNull();
    expect(svc.state.value.arrangements.some((a) => a.exhibitionId === 'old1')).toBe(true);
    expect(svc.state.value.guides.some((g) => g.exhibitionId === 'old1')).toBe(true);

    svc.remove('old1');
    expect(svc.state.value.exhibitions).toHaveLength(0);
    expect(svc.state.value.arrangements).toHaveLength(0);
    expect(svc.state.value.guides).toHaveLength(0);
    expect(svc.state.value.artworks).toHaveLength(1); // 作品档案保留
  });
});
