// 独立子进程：经 Vite 客户端转换 SFC + rolldown 内存打包，再在 happy-dom 里驱动交互。
// 必须作为独立进程运行——Vite dev server 的文件监听会在关闭时结束进程。
import { rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { rolldown } from 'rolldown';
import { createServer } from 'vite';

const root = process.cwd();
const outDir = path.join(root, 'node_modules/.verify');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const server = await createServer({
  root,
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
  logLevel: 'error',
});

const helperMod = '\0plugin-vue:export-helper';
const helperCode = `export default (sfc, props) => { const target = sfc.__vccOpts || sfc; for (const [k, v] of props) target[k] = v; return target; };\n`;

try {
  const bd = await rolldown({
    input: path.join(root, 'verify/src/studio-entry.ts'),
    platform: 'node',
    external: ['node:*', 'vue', 'happy-dom'],
    plugins: [
      {
        name: 'vite-client-transform',
        resolveId(source) {
          if (source === '/@id/__x00__plugin-vue:export-helper') return helperMod;
          if (source.startsWith('/node_modules/.vite/deps/vue.js')) {
            return { id: 'vue', external: true };
          }
          if (source.startsWith('/src/')) return { id: path.join(root, source.slice(1)) };
          return null;
        },
        load(id) {
          if (id === helperMod) return helperCode;
          return null;
        },
        async transform(_code, id) {
          if (id.includes('/src/') && (id.endsWith('.vue') || id.endsWith('.ts'))) {
            const url = '/' + path.relative(root, id);
            const r = await server.transformRequest(url);
            return r ? { code: r.code, map: null } : null;
          }
          return null;
        },
      },
    ],
  });
  await bd.write({ format: 'esm', file: path.join(outDir, 'studio-entry.mjs') });
  await bd.close();

  // 打包结果注入全局，然后执行断言脚本
  const merged = path.join(outDir, 'interaction-exec.mjs');
  const runner = new URL('./interaction-run.mjs', import.meta.url).href;
  const { writeFileSync } = await import('node:fs');
  writeFileSync(
    merged,
    `import { Studio } from ${JSON.stringify(path.join(outDir, 'studio-entry.mjs'))};\n` +
      `globalThis.__STUDIO__ = Studio;\nawait import(${JSON.stringify(runner)});\n`,
  );

  // 先关掉 server 再执行，避免其监听影响子进程退出
  await server.close();
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [merged], { encoding: 'utf8' });
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  rmSync(outDir, { recursive: true, force: true });
  process.exit(r.status ?? 1);
} catch (e) {
  await server.close().catch(() => {});
  rmSync(outDir, { recursive: true, force: true });
  console.error(e);
  process.exit(1);
}
