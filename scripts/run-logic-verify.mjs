// 逻辑层验证运行器：用 tsc 把 TS 测试与源码转译到临时目录（ESM），
// 给相对导入补 .js 扩展名后运行。结束后清理临时目录。
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'piece-browser-verify-'));

const tsc = spawnSync(
  process.execPath,
  [
    path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(root, 'scripts', 'verify-piece-browser.ts'),
    '--outDir', out,
    '--module', 'esnext',
    '--target', 'es2022',
    '--moduleResolution', 'bundler',
    '--skipLibCheck',
    '--strict',
    '--types', 'node',
    '--ignoreConfig',
  ],
  { cwd: root, encoding: 'utf8' },
);
if (tsc.status !== 0) {
  console.error(tsc.stdout, tsc.stderr);
  rmSync(out, { recursive: true, force: true });
  process.exit(1);
}

// Node 原生 ESM 需要显式扩展名
function walk(dir) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name.endsWith('.js')) {
      const src = readFileSync(p, 'utf8').replace(
        /(from\s*['"]\.[^'"]*?)(['"])/g,
        (m, spec, q) => (spec.endsWith('.js') ? m : spec + '.js' + q),
      );
      writeFileSync(p, src);
    }
  }
}
walk(out);
writeFileSync(path.join(out, 'package.json'), JSON.stringify({ type: 'module' }));
// 让临时代码能解析到项目的 node_modules（vue 等）
symlinkSync(path.join(root, 'node_modules'), path.join(out, 'node_modules'), 'dir');

try {
  await import(pathToFileURL(path.join(out, 'scripts', 'verify-piece-browser.js')).href);
} catch (err) {
  console.error(err);
  rmSync(out, { recursive: true, force: true });
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
