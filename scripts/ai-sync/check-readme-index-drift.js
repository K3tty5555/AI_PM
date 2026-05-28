#!/usr/bin/env node

// 检测项目 README 索引与实际目录的漂移（A 档：只检测提醒，不自动写）。
// 当前覆盖 07-references/README.md：对比 README 表格已登记路径 vs 目录顶层实际 entries。
// 复用 check-visual-anchor-package.js 的 STATUS/MESSAGE + exit code 风格。
//
// Usage:
//   node scripts/ai-sync/check-readme-index-drift.js <project_dir>
//
// Exit codes:
//   0  索引一致（clean），或目标 README 不存在（软放行，不打扰）
//   1  参数错误 / references 目录缺失
//   3  检测到漂移（drift）——hook 侧用 `|| true` 软提醒，不阻断

const fs = require('fs');
const path = require('path');

const SUBDIR = '07-references';

function usage() {
  console.log([
    'Usage:',
    '  node scripts/ai-sync/check-readme-index-drift.js <project_dir>',
    '',
    `检测 <project_dir>/${SUBDIR}/README.md 索引与目录顶层 entries 的漂移。`,
    '',
    'Exit codes:',
    '  0  clean 或 README 不存在（软放行）',
    '  1  参数错误 / 目录缺失',
    '  3  drift（检测到未索引或孤儿条目）',
  ].join('\n'));
}

// 去尾斜杠 + trim，统一比对粒度（目录登记可能带 / 也可能不带）
function normalize(p) {
  return p.trim().replace(/\/+$/, '');
}

const projectDir = process.argv[2];
if (!projectDir || projectDir === '-h' || projectDir === '--help') {
  usage();
  process.exit(projectDir ? 0 : 1);
}

const refDir = path.resolve(projectDir, SUBDIR);
const readme = path.join(refDir, 'README.md');

if (!fs.existsSync(refDir) || !fs.statSync(refDir).isDirectory()) {
  console.log('STATUS: skip');
  console.log(`MESSAGE: 未找到 ${SUBDIR}/ 目录，跳过`);
  process.exit(1);
}

// README 缺失 → 软放行（新项目可能还没生成索引，不打扰冷启动）
if (!fs.existsSync(readme)) {
  console.log('STATUS: skip');
  console.log(`MESSAGE: ${SUBDIR}/README.md 不存在，跳过（可由 ai-pm 初始化生成）`);
  process.exit(0);
}

// 1. 实际顶层 entries（目录与文件，排除 README.md 与隐藏文件）
const actual = new Set();
for (const name of fs.readdirSync(refDir)) {
  if (name.startsWith('.') || name === 'README.md') continue;
  actual.add(normalize(name));
}

// 2. README 表格第一列反引号路径（仅匹配表格行行首的第一个 `...`）
const registered = new Set();
const lines = fs.readFileSync(readme, 'utf8').split('\n');
const rowRe = /^\|\s*`([^`]+)`/;
for (const line of lines) {
  const m = line.match(rowRe);
  if (m) registered.add(normalize(m[1]));
}

// 3. 双向 diff
const unindexed = [...actual].filter(p => !registered.has(p)).sort();   // 目录有，README 没登记
const orphaned = [...registered].filter(p => !actual.has(p)).sort();    // README 登记，目录已删

if (unindexed.length === 0 && orphaned.length === 0) {
  console.log('STATUS: clean');
  console.log(`SCOPE: ${SUBDIR}`);
  console.log(`MESSAGE: README 索引与目录一致（${actual.size} 项）`);
  process.exit(0);
}

console.log('STATUS: drift');
console.log(`SCOPE: ${SUBDIR}`);
console.log(`NEXT_ACTION: 补全 ${SUBDIR}/README.md 索引（用途字段不确定标 [待 PM 补充]，禁止编造）`);
if (unindexed.length) {
  console.log(`未索引（目录有，README 未登记）：${unindexed.length}`);
  unindexed.forEach(p => console.log(`  🔴 ${p}`));
}
if (orphaned.length) {
  console.log(`孤儿（README 登记，目录已删）：${orphaned.length}`);
  orphaned.forEach(p => console.log(`  🟡 ${p}`));
}
process.exit(3);
