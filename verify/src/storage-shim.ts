// 极简 localStorage 垫片：SEED_STORAGE 环境变量用于模拟“刷新后”的既有存档。
class MemoryStorage {
  private store: Map<string, string>;
  constructor(seed?: string | null) {
    this.store = new Map<string, string>();
    if (seed) {
      try {
        const parsed = JSON.parse(seed);
        for (const [k, v] of Object.entries(parsed)) this.store.set(k, String(v));
      } catch {
        /* 空种子 */
      }
    }
  }
  getItem(k: string) {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.store.set(k, String(v));
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
  clear() {
    this.store.clear();
  }
  get length() {
    return this.store.size;
  }
  key(i: number) {
    return [...this.store.keys()][i] ?? null;
  }
}

const g = globalThis as any;
g.localStorage = new MemoryStorage(process.env.SEED_STORAGE);
