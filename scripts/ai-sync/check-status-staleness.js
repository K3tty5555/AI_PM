#!/usr/bin/env node

// 检测项目状态保鲜度 + 死链（A 档：只检测提醒，不自动写）。
// 与 check-readme-index-drift.js 互补：那个查 07-references 索引表，本脚本查
//   ① _status.json.updated 是否滞后于项目内最新「内容文件」的 mtime
//   ② 项目 README.md / _memory/*.md 里反引号或 md 链接引用的「相对路径」是否已不存在
// 全项目扫描（区别于 index-drift 只查最近 1 个项目）。沿用 STATUS/exit-code 风格。
//
// Usage:
//   node scripts/ai-sync/check-status-staleness.js <projects_dir>   # 扫所有子项目
//   node scripts/ai-sync/check-status-staleness.js <projects_dir> --json
//
// Exit codes:
//   0  全部 clean（或无可扫项目）——软放行
//   1  参数错误 / 目录缺失
//   3  检测到漂移（状态滞后 或 死链）——hook 侧软提醒，不阻断

const fs = require('fs');
const path = require('path');

// 算「最新内容文件」时排除的元数据/构建产物（这些变了不代表业务进展）
const EXCLUDE_DIRS = new Set(['_memory', '_summaries', '_logs', 'node_modules', 'dist', '.git']);
const EXCLUDE_FILES = new Set(['_status.json', 'README.md']);
const MAX_WALK = 60000; // 兜底，防超大目录卡死

function usage() {
  console.log([
    'Usage:',
    '  node scripts/ai-sync/check-status-staleness.js <projects_dir> [--json]',
    '',
    '检测每个项目的 _status.json 保鲜度 + README/_memory 死链。',
    '',
    'Exit codes:',
    '  0  clean / 无项目（软放行）   1  参数错误   3  drift',
  ].join('\n'));
}

// mtime → 本地 YYYY-MM-DD（与 _status.json.updated 的日期串可直接字符串比较）
function localDate(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 递归找项目内最新「内容文件」的 mtime（跳过元数据/构建产物/隐藏）
function newestContentMtime(projectDir) {
  let newest = 0, newestFile = '', walked = 0;
  const stack = [projectDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (EXCLUDE_DIRS.has(ent.name)) continue;
        stack.push(full);
      } else {
        if (EXCLUDE_FILES.has(ent.name)) continue;
        // 备份/临时文件不算内容进展（.bak 曾让 web端考试阅卷 永久误报滞后）
        if (/\.(bak|tmp|swp)$|~$/.test(ent.name)) continue;
        if (++walked > MAX_WALK) return { newest, newestFile };
        let st;
        try { st = fs.statSync(full); } catch { continue; }
        if (st.mtimeMs > newest) { newest = st.mtimeMs; newestFile = path.relative(projectDir, full); }
      }
    }
  }
  return { newest, newestFile };
}

// 从 md 文本抽「相对路径」引用：反引号 `path` 或 md 链接 ](path)
function extractPathRefs(text) {
  const refs = new Set();
  const pats = [/`([^`\n]+?)`/g, /\]\(([^)\n]+?)\)/g];
  for (const re of pats) {
    let m;
    while ((m = re.exec(text))) {
      let v = m[1].trim();
      if (!v) continue;
      v = v.split('#')[0].trim();            // 去锚点
      if (/\s/.test(v)) continue;            // 含空格 → 多半是命令/句子，不是路径
      if (/[{}*?<>|]/.test(v)) continue;     // 模板占位符 {phase} / 通配 / 非法字符
      if (v.includes('...')) continue;       // 省略写法（如 `a/.../b`），不是真路径
      if (/^(https?:|mailto:|~|\/|#)/.test(v)) continue; // 外链/绝对路径/home：不归本项目管
      const clean = v.replace(/^\.\//, '').replace(/\/+$/, ''); // 去 ./ 前缀 + 尾斜杠（同一链接两种写法归一去重）
      if (!clean.includes('/')) continue;    // 必须含「内部」斜杠——滤掉单段目录名(05-prd/、assets/)与裸文件名(误报高)
      refs.add(clean);
    }
  }
  return [...refs];
}

// 死链只扫 README.md（活索引）。_memory/ 故意不扫：决策日志(L1)/身份(L0)是 append-only 历史，
// 会合法地引用已删除/外部/历史状态（如"已删 X"），扫它只会制造假死链。
function checkDeadLinks(projectDir, repoRoot) {
  const dead = [];
  const md = path.join(projectDir, 'README.md');
  if (!fs.existsSync(md)) return dead;
  let text;
  try { text = fs.readFileSync(md, 'utf8'); } catch { return dead; }
  const bases = [path.dirname(md), projectDir, repoRoot, process.cwd()];
  for (const ref of extractPathRefs(text)) {
    const found = bases.some(b => fs.existsSync(path.resolve(b, ref)));
    if (!found) dead.push({ file: 'README.md', ref });
  }
  return dead;
}

function checkProject(projectDir, repoRoot) {
  const name = path.basename(projectDir);
  const issues = { stale: null, dead: [] };

  // ① 状态保鲜
  const statusPath = path.join(projectDir, '_status.json');
  if (fs.existsSync(statusPath)) {
    let updated = null;
    try { updated = (JSON.parse(fs.readFileSync(statusPath, 'utf8')).updated || '').slice(0, 10); }
    catch (e) { console.error(`⚠️ ${name}/_status.json 损坏或不可解析（${e.name}），该项目保鲜检查跳过`); }
    if (updated) {
      const { newest, newestFile } = newestContentMtime(projectDir);
      if (newest) {
        const newestDate = localDate(newest);
        if (newestDate > updated) issues.stale = { updated, newestDate, newestFile };
      }
    }
  }

  // ② 死链
  issues.dead = checkDeadLinks(projectDir, repoRoot);
  return { name, issues };
}

// ---- main ----
const projectsDir = process.argv[2];
const asJson = process.argv.includes('--json');
if (!projectsDir || projectsDir === '-h' || projectsDir === '--help') { usage(); process.exit(projectsDir ? 0 : 1); }
if (!fs.existsSync(projectsDir) || !fs.statSync(projectsDir).isDirectory()) {
  console.log('STATUS: skip'); console.log('MESSAGE: projects 目录不存在，跳过'); process.exit(1);
}

// 仓库根：用于解析 README 里写成仓库根相对的路径（如 `output/projects/X/...`）
const repoRoot = path.resolve(projectsDir, '..', '..');

const projects = fs.readdirSync(projectsDir, { withFileTypes: true })
  .filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
  .map(e => path.join(projectsDir, e.name));

const results = projects.map(p => checkProject(p, repoRoot)).filter(r => r.issues.stale || r.issues.dead.length);

if (asJson) { console.log(JSON.stringify(results, null, 2)); process.exit(results.length ? 3 : 0); }

if (results.length === 0) {
  console.log('STATUS: clean');
  console.log(`MESSAGE: ${projects.length} 个项目状态新鲜、无死链`);
  process.exit(0);
}

console.log('STATUS: drift');
console.log('NEXT_ACTION: 校准滞后项目的 _status.json.updated / 修复死链（机械层可自动，语义字段留 [待 PM 补充]，禁止编造）');
for (const r of results) {
  const parts = [];
  if (r.issues.stale) parts.push(`状态滞后（updated ${r.issues.stale.updated} < 最新文件 ${r.issues.stale.newestDate}：${r.issues.stale.newestFile}）`);
  if (r.issues.dead.length) parts.push(`死链 ${r.issues.dead.length} 处`);
  console.log(`  🔸 ${r.name}：${parts.join('；')}`);
  for (const d of r.issues.dead) console.log(`      ✗ ${d.file} → ${d.ref}`);
}
process.exit(3);
