#!/usr/bin/env node
// 统一本地质量检查入口：Vue/TS 类型检查 -> 产物构建。
// 纯本地脚本，不依赖网络，也不会运行测试框架（测试按基线约定延后）。
//
// 用法：
//   node scripts/check.mjs                 依次执行类型检查和构建
//   node scripts/check.mjs --skip typecheck   跳过类型检查
//   node scripts/check.mjs --skip build       跳过产物构建
//
// 退出码（任何一步失败都以明确的非零退出码结束）：
//   0  = 全部通过
//   1  = 参数用法错误
//   10 = 类型检查失败
//   20 = 产物构建失败
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const binExt = process.platform === "win32" ? ".cmd" : "";
const localBin = (name) => join(root, "node_modules", ".bin", name + binExt);

const STEPS = {
  typecheck: {
    label: "Vue/TS 类型检查 (vue-tsc -b)",
    bin: localBin("vue-tsc"),
    args: ["-b"],
    code: 10,
  },
  build: {
    label: "产物构建 (vite build)",
    bin: localBin("vite"),
    args: ["build"],
    code: 20,
  },
};

// 解析 --skip 参数（只允许跳过已知步骤）。
const skip = new Set();
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === "--skip") {
    const value = process.argv[++i];
    if (!value || !STEPS[value]) {
      console.error(
        `错误：--skip 需要指定步骤名：${Object.keys(STEPS).join(" | ")}`
      );
      process.exit(1);
    }
    skip.add(value);
  } else {
    console.error(`错误：未知参数 ${arg}（可用：--skip typecheck|build）`);
    process.exit(1);
  }
}

const order = ["typecheck", "build"];
const planned = order.filter((name) => !skip.has(name));

if (planned.length === 0) {
  console.error("错误：类型检查和构建不能同时跳过。");
  process.exit(1);
}

for (const name of planned) {
  const step = STEPS[name];
  console.log(`\n=== 开始：${step.label} ===`);

  if (!existsSync(step.bin)) {
    console.error(
      `错误：找不到本地可执行文件 ${step.bin}，请先运行 npm install。`
    );
    process.exit(step.code);
  }

  // 继承 stdio：各步骤自身的输出原样透传，便于定位问题来源。
  const result = spawnSync(step.bin, step.args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    console.error(
      `\n=== 失败：${step.label}（退出码 ${result.status ?? "未知"}）===`
    );
    process.exit(step.code);
  }

  console.log(`=== 通过：${step.label} ===`);
}

const skipped = order.filter((name) => skip.has(name));
const note = skipped.length
  ? `（已跳过：${skipped.map((name) => STEPS[name].label).join("、")}）`
  : "";
console.log(`\n全部检查通过${note}`);
process.exit(0);
