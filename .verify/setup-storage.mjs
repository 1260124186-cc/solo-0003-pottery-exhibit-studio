// 在任何业务模块导入前装好假 localStorage（业务模块在顶层读取它）。
class FakeStorage {
  constructor(initial = {}) {
    this.m = new Map(Object.entries(initial));
  }
  getItem(k) {
    return this.m.has(k) ? this.m.get(k) : null;
  }
  setItem(k, v) {
    this.m.set(k, String(v));
  }
  removeItem(k) {
    this.m.delete(k);
  }
  dump() {
    return Object.fromEntries(this.m);
  }
}
const initial = process.env.__SEED_STORAGE__
  ? JSON.parse(process.env.__SEED_STORAGE__)
  : {};
globalThis.localStorage = new FakeStorage(initial);
