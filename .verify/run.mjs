// 用 esbuild 把 TS 测试入口打成单文件 ESM，再在 node 中执行。
// reload/corrupt 场景通过环境变量预置 localStorage 内容（必须在业务模块加载前注入）。
import { rolldown } from 'rolldown';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function bundle(entry, outfile) {
  const build = await rolldown({
    input: new URL(entry, import.meta.url).pathname,
    platform: 'node',
    resolve: { extensions: ['.ts', '.mjs', '.js'] },
  });
  await build.write({ file: outfile, format: 'esm' });
  await build.close();
}

async function run(label, entry, env = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'verify-'));
  const out = join(dir, 'test.mjs');
  try {
    await bundle(entry, out);
    const code = await new Promise((resolve) => {
      const p = spawn(process.execPath, [out], {
        env: { ...process.env, ...env },
        stdio: 'inherit',
      });
      p.on('close', resolve);
    });
    console.log(`${code === 0 ? 'PASS' : 'FAIL'}  ${label}`);
    return code === 0;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const results = [];
results.push(await run('逻辑：筛选/确定性选择/工作面稳定/独立持久化', './logic.test.ts'));

const seedData = {
  exhibitions: [
    { id: 'e1', title: '手的回声', status: '预览中', pieces: ['a1', 'a3'] },
    { id: 'e2', title: '光的容器', status: '草稿', pieces: ['a2', 'a4'] },
  ],
  artworks: [
    { id: 'a1', title: 'A1' }, { id: 'a2', title: 'A2' },
    { id: 'a3', title: 'A3' }, { id: 'a4', title: 'A4' },
  ],
};
results.push(
  await run('刷新：恢复上次筛选项并确定性选中', './reload.test.ts', {
    __SEED_STORAGE__: JSON.stringify({
      'pottery-exhibit-studio-v1': JSON.stringify(seedData),
      'pottery-exhibit-studio-ui-v1': '草稿',
    }),
  }),
);
results.push(
  await run('容错：损坏的 UI 值回退为全部', './corrupt.test.ts', {
    __SEED_STORAGE__: JSON.stringify({
      'pottery-exhibit-studio-v1': JSON.stringify(seedData),
      'pottery-exhibit-studio-ui-v1': '乱码状态',
    }),
  }),
);

const allPass = results.every(Boolean);
console.log(`\n${results.filter(Boolean).length}/${results.length} 个测试文件通过`);
process.exit(allPass ? 0 : 1);
