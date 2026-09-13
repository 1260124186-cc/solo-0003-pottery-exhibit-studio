// 验证编排：纯函数/服务层用 rolldown 直接打包 TS；
// 交互测试先经 Vite 把 .vue 转成客户端 JS，再用 rolldown 内存打包后落盘运行。
import { spawnSync } from 'node:child_process';
import { rmSync, mkdirSync } from 'node:fs';
import { rolldown } from 'rolldown';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = process.cwd();
const dir = (p) => path.join(root, p);
const outDir = dir('node_modules/.verify');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

async function bundle(input, outFile, plugins = []) {
  const bd = await rolldown({
    input: fileURLToPath(new URL(input, import.meta.url)),
    platform: 'node',
    external: ['node:*', 'vite', 'vue', 'vue/server-renderer', 'happy-dom'],
    plugins,
  });
  await bd.write({ format: 'esm', file: path.join(outDir, outFile) });
  await bd.close();
}

function runNode(args, env = {}) {
  return spawnSync(process.execPath, args, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

let failed = 0;
function step(name, res, { expectSeedOut = false } = {}) {
  console.log(`\n=== ${name} ===`);
  process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  if (res.status !== 0) {
    failed++;
    console.error(`✗ ${name} 失败 (exit ${res.status})`);
    return null;
  }
  if (expectSeedOut) {
    const m = res.stdout.match(/SEED_OUT:(\{.*\})/);
    if (!m) {
      failed++;
      console.error('✗ 未捕获到阶段一存档');
      return null;
    }
    console.log(`✓ ${name}`);
    return m[1];
  }
  console.log(`✓ ${name}`);
  return true;
}

// 1. 纯函数测试
await bundle('src/ordering.test.ts', 'ordering.test.mjs');
step(
  '1. 顺序纯函数（上移/下移/拖拽/稳定/导出同序同量）',
  runNode(['--test', path.join(outDir, 'ordering.test.mjs')]),
);

// 1b. 真实 DOM 交互测试（独立子进程：内部用 Vite 转换 SFC，避免 dev server 监听导致主进程提前退出）
step(
  '1b. DOM 交互：点击上移/下移、HTML5 拖放、加入移出、切换展览与刷新同步',
  runNode([fileURLToPath(new URL('build-and-interact.mjs', import.meta.url))]),
);

// 2. 持久化阶段一（全新种子）
await bundle('src/persist-phase1.ts', 'phase1.mjs');
const p1 = runNode([path.join(outDir, 'phase1.mjs')]);
const seed1 = step('2a. 阶段一：调整顺序即时持久化、跨展览隔离、作品字段不变', p1, { expectSeedOut: true });

// 3. 阶段二（携带阶段一存档刷新）
if (seed1) {
  await bundle('src/persist-phase2.ts', 'phase2.mjs');
  step(
    '2b. 阶段二：刷新恢复 + 切换展览后再回来顺序不变',
    runNode([path.join(outDir, 'phase2.mjs')], {
      SEED_STORAGE: JSON.stringify({ 'pottery-exhibit-studio-v1': seed1 }),
    }),
  );

  // 4. 阶段三：脏数据规整
  const dirty = JSON.stringify({
    exhibitions: [
      { id: 'eDirty', title: '重复数据', pieces: ['a3', 'a3', 'a1', 'a1', 'a2'] },
      { id: 'eBroken', title: '空数据', pieces: null },
    ],
    artworks: [],
  });
  await bundle('src/persist-phase3.ts', 'phase3.mjs');
  step(
    '2c. 阶段三：历史脏数据稳定规整',
    runNode([path.join(outDir, 'phase3.mjs')], {
      SEED_STORAGE: JSON.stringify({ 'pottery-exhibit-studio-v1': dirty }),
    }),
  );
}

// 5. 组件级 SSR 一致性（网格 / 详情 / 导览 / 导出）
step(
  '3. 组件渲染：网格·详情·导览·导出顺序与数量同一来源',
  runNode([fileURLToPath(new URL('component-render.mjs', import.meta.url))]),
);

// 6. 生产构建（vue-tsc 类型检查）
{
  const r = spawnSync('npm', ['run', 'build'], { encoding: 'utf8', env: process.env });
  console.log('\n=== 4. 生产构建（类型检查 + 打包） ===');
  process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    failed++;
    console.error('✗ 构建失败');
  } else {
    console.log('✓ 生产构建通过');
  }
}

rmSync(outDir, { recursive: true, force: true });
if (failed) {
  console.error(`\n验证失败：${failed} 个步骤`);
  process.exit(1);
}
console.log('\n全部验证通过 ✓');
