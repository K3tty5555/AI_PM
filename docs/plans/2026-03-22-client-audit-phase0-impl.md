# 客户端审计 Phase 0 + 扫描 — 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 清除共享层技术债，然后扫描全代码库输出问题清单，为后续批量修复提供输入。

**Architecture:** 先串行完成 7 项前置清理（共享文件不能并行改），再用 grep/脚本扫描全代码库输出两层问题清单（高可信度自动检测 + 候选清单）。

**Tech Stack:** Rust (Tauri v2), React/TypeScript, Tailwind CSS, CSS Variables

---

## Task 1: 删除 design-tokens.ts

**Files:**
- Delete: `app/src/lib/design-tokens.ts`
- Modify: `app/src/pages/tools/DesignSpec.tsx:234` — 移除对 design-tokens 的引用（如有 import）

**Step 1: 检查引用**

```bash
grep -rn "design-tokens" app/src/ --include="*.tsx" --include="*.ts"
```

确认哪些文件引用了该模块。

**Step 2: 移除引用并删除文件**

对每个引用文件，移除 import 语句和使用处（替换为 CSS 变量或删除）。然后删除 `design-tokens.ts`。

**Step 3: 验证**

```bash
cd app && npx tsc --noEmit
```

**Step 4: 提交**

```bash
git add -A && git commit -m "chore: remove legacy design-tokens.ts (Terminal design system)"
```

---

## Task 2: 清除 CSS compat alias

**Files:**
- Modify: `app/src/index.css` — 行 140-165（compat alias 定义区）及行 250-256（dark mode 对应）
- Modify: 所有引用 `--yellow`/`--teal`/`--yellow-glow`/`--yellow-bg` 的 `.tsx` 文件

**Step 1: 列出所有引用**

```bash
grep -rn "var(--yellow\|var(--teal\|var(--yellow-glow\|var(--yellow-bg\|var(--dark2\|var(--ease-terminal\|var(--duration-terminal" app/src/ --include="*.tsx" --include="*.ts" --include="*.css"
```

**Step 2: 替换引用**

在所有 `.tsx`/`.ts` 文件中：
- `var(--yellow)` → `var(--accent-color)`
- `var(--yellow-glow)` → `var(--accent-ring)` 或删除整个 shadow 声明
- `var(--yellow-bg)` → `var(--accent-light)`
- `var(--teal)` → 评估语义后替换为对应功能色
- `var(--dark2)` → `var(--text-primary)`
- `var(--ease-terminal)` → `var(--ease-standard)`
- `var(--duration-terminal)` → `var(--dur-base)`

**Step 3: 删除 index.css 中的 alias 定义**

删除 `/* --- Compat aliases --- */` 区块及 dark mode 对应定义。

**Step 4: 验证**

```bash
cd app && npx tsc --noEmit
# 同时用浏览器/tauri dev 检查无样式丢失
```

**Step 5: 提交**

```bash
git add -A && git commit -m "chore: remove compat CSS aliases (--yellow, --teal, etc.)"
```

---

## Task 3: 统一 PHASE_ORDER / PHASE_LABELS

**Files:**
- Create: `app/src/lib/phase-meta.ts`
- Modify: `app/src/layouts/AppLayout.tsx:20-35`
- Modify: `app/src/pages/Dashboard.tsx:29-40`
- Modify: `app/src/components/layout/SidebarShell.tsx:8-12`
- Modify: `app/src/components/layout/TitleBar.tsx:13`
- Modify: `app/src/components/layout/Sidebar.tsx:55`

**Step 1: 创建统一模块**

创建 `app/src/lib/phase-meta.ts`：

```typescript
export const PHASE_ORDER = [
  "requirement", "analysis", "research", "stories", "prd",
  "analytics", "prototype", "review", "retrospective",
] as const

export type Phase = typeof PHASE_ORDER[number]

export const PHASE_LABELS: Record<string, string> = {
  requirement: "需求收集",
  analysis: "需求分析",
  research: "竞品研究",
  stories: "用户故事",
  prd: "PRD 撰写",
  analytics: "埋点设计",
  prototype: "原型设计",
  review: "需求评审",
  retrospective: "项目复盘",
}
```

注意：先对比 5 个文件中的 labels 取最准确的版本。

**Step 2: 替换所有文件中的定义为 import**

在每个文件中删除本地的 `PHASE_ORDER`/`PHASE_LABELS` 定义，替换为：
```typescript
import { PHASE_ORDER, PHASE_LABELS } from "@/lib/phase-meta"
```

**Step 3: 验证**

```bash
cd app && npx tsc --noEmit
```

**Step 4: 提交**

```bash
git add -A && git commit -m "refactor: unify PHASE_ORDER/PHASE_LABELS to lib/phase-meta.ts"
```

---

## Task 4: 统一 enriched_path()

**Files:**
- Modify: `app/src-tauri/src/commands/env.rs:8` — 删除本地 `enriched_path` 实现，改为 import
- Verify: `app/src-tauri/src/providers/claude_cli.rs:12` — 确认 `pub fn enriched_path()` 已存在

**Step 1: 修改 env.rs**

删除 `env.rs` 中的 `fn enriched_path()` 函数定义（约 8-35 行），替换为：

```rust
use crate::providers::claude_cli::enriched_path;
```

确保 `env.rs` 中所有调用处（行 186、218）不需要改动（函数签名相同）。

**Step 2: 验证**

```bash
PATH="$HOME/.cargo/bin:$PATH" cargo check --manifest-path app/src-tauri/Cargo.toml
```

**Step 3: 提交**

```bash
git add app/src-tauri/src/commands/env.rs && git commit -m "refactor: unify enriched_path() to single source in claude_cli.rs"
```

---

## Task 5: Rust 代码清理

**Files:**
- Modify: `app/src-tauri/src/commands/config.rs:215,219,322,326` — unwrap → map_err
- Modify: `app/src-tauri/src/commands/stream.rs:237,532` — 移除 config_dir 参数
- Modify: `app/src-tauri/src/providers/anthropic.rs:32` — 添加超时
- Modify: `app/src-tauri/src/providers/openai.rs:35` — 添加超时
- Modify: `app/src-tauri/src/commands/knowledge.rs` — call_ai_via_api 添加超时

**Step 1: config.rs unwrap 替换**

找到 4 处 `unwrap()`：
- 行 215: `path.parent().unwrap()` → `.ok_or("无效的配置路径")?`
- 行 219: `serde_json::to_string_pretty(&config).unwrap()` → `.map_err(|e| e.to_string())?`
- 行 322: 同上模式
- 行 326: 同上模式

**Step 2: stream.rs 移除 config_dir**

1. 从 `build_system_prompt` 的参数列表中移除 `config_dir: &str`
2. 更新调用方 `start_stream` 中传参（约行 532），移除 `config_dir` 参数

**Step 3: API providers 添加超时**

在 `anthropic.rs` 和 `openai.rs` 中，将：
```rust
let client = reqwest::Client::new();
```
改为：
```rust
let client = reqwest::Client::builder()
    .connect_timeout(std::time::Duration::from_secs(30))
    .timeout(std::time::Duration::from_secs(600))
    .build()
    .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))?;
```

在 `knowledge.rs` 的 `call_ai_via_api` 中也做同样修改（超时可以短一些，120 秒）。

**Step 4: 验证**

```bash
PATH="$HOME/.cargo/bin:$PATH" cargo clippy --manifest-path app/src-tauri/Cargo.toml -- -W clippy::all 2>&1 | tail -20
```

目标：零 warning（除非是第三方依赖产生的）。

**Step 5: 提交**

```bash
git add app/src-tauri/src/ && git commit -m "fix: replace unwrap with error handling, add reqwest timeouts, remove unused config_dir"
```

---

## Task 6: CLI 安全限制

**Files:**
- Modify: `app/src-tauri/src/commands/knowledge.rs` — `call_ai_via_cli` 函数

**Step 1: 替换 --dangerously-skip-permissions**

在 `call_ai_via_cli` 中，将：
```rust
.arg("--dangerously-skip-permissions")
```
改为：
```rust
.arg("--allowedTools")
.arg("Read")
```

这样 CLI 只能读取文件，不能写入或执行命令。知识提取场景只需要分析能力，不需要文件操作权限。

注意：`claude_cli.rs` 中的 `ClaudeCliProvider::stream()` 保留 `--dangerously-skip-permissions`，因为 PRD 生成等阶段可能需要文件操作。

**Step 2: 验证**

```bash
PATH="$HOME/.cargo/bin:$PATH" cargo check --manifest-path app/src-tauri/Cargo.toml
```

**Step 3: 提交**

```bash
git add app/src-tauri/src/commands/knowledge.rs && git commit -m "security: restrict CLI permissions for knowledge extraction"
```

---

## Task 7: 全代码库扫描

**Files:**
- 无文件修改，只输出扫描报告

**Step 1: Layer 1 高可信度扫描**

运行以下命令，将结果保存为报告：

```bash
echo "=== 1. 硬编码色值（Tailwind 色彩类）==="
grep -rn "text-red-\|text-green-\|text-blue-\|text-yellow-\|text-orange-\|text-pink-\|text-purple-\|text-gray-\|bg-red-\|bg-green-\|bg-blue-\|bg-yellow-\|bg-orange-\|bg-pink-\|bg-purple-\|bg-gray-\|border-red-\|border-green-\|border-blue-" app/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v "// " || echo "(无)"

echo "=== 2. 硬编码十六进制色值（非 CSS 变量）==="
grep -rn "#[0-9a-fA-F]\{3,8\}" app/src/ --include="*.tsx" --include="*.ts" | grep -v "var(--" | grep -v node_modules | grep -v "\.svg" | grep -v "//" || echo "(无)"

echo "=== 3. 未定义的 CSS 变量引用 ==="
grep -rn "var(--yellow\|var(--teal\|var(--dark2\|var(--ease-terminal\|var(--duration-terminal" app/src/ --include="*.tsx" --include="*.ts" --include="*.css" || echo "(无)"

echo "=== 4. tracking-[...] 违规 ==="
grep -rn "tracking-\[" app/src/ --include="*.tsx" --include="*.ts" || echo "(无)"

echo "=== 5. as any / @ts-ignore ==="
grep -rn "as any\|@ts-ignore\|@ts-expect-error" app/src/ --include="*.tsx" --include="*.ts" || echo "(无)"

echo "=== 6. Rust unwrap()/expect() 在 commands/ ==="
grep -rn "\.unwrap()\|\.expect(" app/src-tauri/src/commands/ --include="*.rs" || echo "(无)"

echo "=== 7. reqwest Client::new() 无超时 ==="
grep -rn "Client::new()" app/src-tauri/src/ --include="*.rs" || echo "(无)"
```

**Step 2: Layer 2 候选清单**

```bash
echo "=== 8. font-mono 使用（需人工判断上下文）==="
grep -rn "font-mono\|font-terminal" app/src/ --include="*.tsx" --include="*.ts" || echo "(无)"

echo "=== 9. 圆角候选（需判断上下文）==="
grep -rn " rounded " app/src/ --include="*.tsx" | grep -v "rounded-" || echo "(无)"
grep -rn "rounded\"" app/src/ --include="*.tsx" || echo "(无)"

echo "=== 10. 缺少 aria-label 的图标按钮（需人工确认）==="
grep -rn "<button" app/src/ --include="*.tsx" -l | sort

echo "=== 11. document.querySelector 反模式 ==="
grep -rn "document\.querySelector\|document\.getElementById" app/src/ --include="*.tsx" --include="*.ts" || echo "(无)"
```

**Step 3: 保存报告**

将上述扫描结果保存到 `docs/plans/audit-scan-report.md`。

**Step 4: 提交**

```bash
git add -f docs/plans/audit-scan-report.md && git commit -m "docs: audit scan report (Layer 1 + Layer 2 candidates)"
```

---

## 后续

扫描报告产出后：
1. 对 Layer 1 结果按文件分组
2. 按用户路径分级（路径 A > B > C）
3. 编写 Phase A（基础层修复）和 Phase B（页面层并行修复）的详细实施计划
4. 执行修复 → 回归验证
