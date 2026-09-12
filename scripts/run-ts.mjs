// Vite 8 自带 rolldown，用它把 TS 验证脚本打包成 ESM 临时文件后执行
//（Node 20 无法直接运行 .ts）。不引入任何额外依赖。
// 用法：node scripts/run-ts.mjs <entry.ts>
import { build } from 'rolldown';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const entry = process.argv[2];
if (!entry) throw new Error('缺少入口参数，例如：node scripts/run-ts.mjs scripts/verify-readiness.ts');

const root = new URL('..', import.meta.url);
const rootPath = fileURLToPath(root);
const tmpUrl = new URL('./node_modules/.tmp/verify-bundle.mjs', root);
mkdirSync(new URL('./node_modules/.tmp/', root), { recursive: true });

const result = await build({
  input: resolve(rootPath, entry),
  platform: 'node',
});
const chunk = result.output[0];
if (!chunk || chunk.type !== 'chunk') throw new Error('验证脚本打包失败');

writeFileSync(tmpUrl, chunk.code);
try {
  process.env.READINESS_ROOT = rootPath;
  await import(tmpUrl);
} finally {
  rmSync(tmpUrl, { force: true });
}
