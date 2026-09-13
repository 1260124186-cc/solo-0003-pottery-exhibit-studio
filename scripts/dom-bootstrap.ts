// 引导：先安装 happy-dom 全局，再加载测试主体（主体会静态 import .vue SFC）。
import { Window } from 'happy-dom';

const window = new Window({ url: 'http://localhost/' });
(globalThis as any).window = window;
for (const key of Object.getOwnPropertyNames(window)) {
  if (key === 'window' || key === 'globalThis' || key in globalThis) continue;
  try {
    (globalThis as any)[key] = (window as any)[key];
  } catch {
    /* 只读属性忽略 */
  }
}

await import('./dom-lib.ts');
