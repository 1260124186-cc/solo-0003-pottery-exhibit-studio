/**
 * 验证脚本专用的 localStorage 垫片：直接读写临时文件。
 * 必须在任何读取 localStorage 的模块之前最先 import，
 * ESM 按导入顺序求值，因此本文件先于 exhibitService 执行。
 * 父进程写入、子进程（reload 模式）读取同一份文件，模拟刷新。
 */
import fs from 'node:fs';

const STORE_FILE = process.env.STORE_FILE!;
const KEY = 'pottery-exhibit-studio-v1';

// 非 reload 模式（父进程）总是从种子数据开始
if (process.argv[2] !== 'reload') {
  try {
    fs.rmSync(STORE_FILE);
  } catch {
    /* ignore */
  }
}

(globalThis as any).localStorage = {
  getItem(k: string) {
    if (k !== KEY) return null;
    try {
      const v = fs.readFileSync(STORE_FILE, 'utf8');
      return v.length ? v : null;
    } catch {
      return null;
    }
  },
  setItem(k: string, v: string) {
    if (k === KEY) fs.writeFileSync(STORE_FILE, String(v));
  },
  removeItem(k: string) {
    if (k === KEY) {
      try {
        fs.rmSync(STORE_FILE);
      } catch {
        /* ignore */
      }
    }
  },
};
