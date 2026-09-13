// Node ESM loader：让测试脚本能 import 经 Vite 客户端管线转换的 .vue / .ts 模块。
// - .vue：走 vite.transformRequest（客户端构建，render 函数版本，不走 SSR 分支）
// - .ts：走 Vite 内置 oxc 剥离类型
// - 其余（vue 等裸包）：交回 Node 默认解析
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire, builtinModules } from 'node:module';
import { transformWithOxc } from 'vite';

const require = createRequire(import.meta.url);
// 把裸包名固定到同一个绝对文件 URL（优先 ESM 产物），避免解析出多份 Vue 实例
const bareMap = new Map();
function resolveBare(specifier) {
  if (!bareMap.has(specifier)) {
    let url;
    try {
      const pkgPath = require.resolve(`${specifier}/package.json`);
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const entry = pkg.module ?? pkg.main;
      url = pathToFileURL(require.resolve(path.posix.join(specifier, entry))).href;
    } catch {
      url = pathToFileURL(require.resolve(specifier)).href;
    }
    bareMap.set(specifier, url);
  }
  return bareMap.get(specifier);
}

let viteSingleton;
async function getServer() {
  if (viteSingleton) return viteSingleton;
  const { createServer } = await import('vite');
  const server = await createServer({
    root: process.cwd(),
    server: { middlewareMode: true },
    logLevel: 'silent',
    appType: 'custom',
  });
  // 暴露给测试脚本复用同一个模块图/单例
  globalThis.__viteTestServer = server;
  viteSingleton = server;
  return server;
}

export async function resolve(specifier, context, nextResolve) {
  // 测试环境不需要 HMR 客户端，提供无操作的热更新上下文
  if (specifier === '/@vite/client') {
    return {
      url: 'data:text/javascript,' + encodeURIComponent(
        'const noop=()=>{};export const createHotContext=()=>({accept:noop,dispose:noop,on:noop,off:noop,send:noop,invalidate:noop});',
      ),
      shortCircuit: true,
    };
  }
  // SFC 拆出的样式虚拟模块：测试里直接置空
  if (/\.vue\?vue&type=style/.test(specifier)) {
    return { url: 'data:text/javascript,export default {};', shortCircuit: true };
  }
  // @vitejs/plugin-vue 的虚拟模块：export-helper 内容固定，直接内联提供
  if (specifier.startsWith('/@id/')) {
    if (specifier.includes('plugin-vue:export-helper')) {
      return {
        url: 'data:text/javascript,' + encodeURIComponent(
          'export default (sfc, props) => { const target = sfc.__vccOpts || sfc; for (const [key, val] of props) { target[key] = val; } return target; };',
        ),
        shortCircuit: true,
      };
    }
    return { url: new URL(specifier, 'http://vite-virtual/').href, shortCircuit: true };
  }
  // Vite dev 输出的 /src/... 根绝对路径 → 项目内文件（规范成 file URL，保证与相对导入同单例）
  if (specifier.startsWith('/src/')) {
    return {
      url: pathToFileURL(process.cwd() + specifier).href,
      shortCircuit: true,
    };
  }
  if (specifier.endsWith('.vue') || /\.vue\?/.test(specifier)) {
    const server = await getServer();
    const parent = context.parentURL ? fileURLToPath(context.parentURL) : undefined;
    const resolved = await server.pluginContainer.resolveId(specifier, parent);
    const id = resolved?.id ?? fileURLToPath(new URL(specifier, context.parentURL ?? pathToFileURL(process.cwd() + '/')).href);
    return { url: id.startsWith('file:') ? id : pathToFileURL(id).href, shortCircuit: true };
  }
  // 裸包（vue 等）固定到单一绝对 URL，保证 SFC 与测试共享同一个 Vue/服务单例
  if (!specifier.startsWith('.') && !specifier.startsWith('/')
    && !specifier.includes('://')
    && !specifier.startsWith('node:')
    && !builtinModules.includes(specifier)) {
    try {
      return { url: resolveBare(specifier), shortCircuit: true };
    } catch {
      return nextResolve(specifier, context);
    }
  }
  // TS 无扩展名导入（Vite 风格）：依次补 .ts/.vue/index.ts
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    const candidates = [`${base}.ts`, `${base}.vue`, `${base}/index.ts`];
    for (const c of candidates) {
      if (existsSync(c)) return { url: pathToFileURL(c).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('data:')) {
    return nextLoad(url);
  }
  // Vite 虚拟模块（/@id/...）
  if (url.startsWith('http://vite-virtual/')) {
    const server = await getServer();
    const spec = '/' + url.slice('http://vite-virtual/'.length); // /@id/__x00__plugin-vue:export-helper
    const resolved = await server.pluginContainer.resolveId(spec);
    const result = await server.transformRequest(resolved?.id ?? spec);
    if (result) return { format: 'module', source: result.code, shortCircuit: true };
  }
  if (url.includes('.vue')) {
    const server = await getServer();
    const requestUrl = url.startsWith('file:') ? fileURLToPath(url) : url;
    const result = await server.transformRequest(requestUrl);
    if (result) {
      // 让 Node 直接用 node_modules 里的裸包，绕开 Vite 预打包缓存路径
      const code = result.code.replace(
        /(["'])(\/node_modules\/\.vite\/deps\/(?:[^'"]+?)\.js)(?:\?v=[0-9a-f]+)?\1/g,
        (m, q, p) => q + p.match(/\/deps\/(.+?)\.js$/)[1] + q,
      );
      return { format: 'module', source: code, shortCircuit: true };
    }
  }

  if (url.startsWith('file:') && url.endsWith('.ts')) {
    const { source } = await nextLoad(url, { ...context, format: 'module' });
    const code = typeof source === 'string' ? source : Buffer.from(source).toString('utf8');
    const out = await transformWithOxc(code, url, { loader: 'ts' });
    return { format: 'module', source: out.code, shortCircuit: true };
  }

  return nextLoad(url, context);
}
