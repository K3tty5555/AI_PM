# 客户端系统性审计与修复设计

> 日期：2026-03-22
> 状态：已确认（经多视角审视修订）

---

## 一、目标

对 Tauri v2 客户端进行系统性审计和修复，解决两个维度的问题：
1. 设计规范合规性 — 所有页面/组件符合 `docs/design-system.md`
2. 代码质量 — 消除 bug、反模式、安全隐患

## 二、四步流程

### 第零步：前置清理

在扫描和修复之前，先消除共享层面的技术债。这些是并行修复的前提条件，必须串行完成。

#### 0.1 删除 `design-tokens.ts`

`app/src/lib/design-tokens.ts` 保留了旧"终末地"设计体系（`#fffa00` 黄色 accent、`Courier New` 字体、`radius: "0"`），与当前规范完全矛盾。当前已完全依赖 CSS 变量，此文件无存在必要。

- 删除文件
- 清除所有 import 引用（检查 `DesignSpec.tsx` 等）
- 若有组件依赖其导出值，改为直接使用 CSS 变量

#### 0.2 清除 CSS compat alias

`index.css` 中存在一组语义错误的兼容别名：

| 旧变量名 | 实际值 | 应替换为 |
|----------|--------|----------|
| `--yellow` | `#1D4ED8` | `--accent-color` |
| `--yellow-glow` | 蓝色 glow | `--accent-glow` 或删除 |
| `--yellow-bg` | 蓝色浅底 | `--accent-light` |
| `--teal` | 对应功能色 | 评估后替换或删除 |
| `--dark2` | 对应文字色 | `--text-primary` |
| `--ease-terminal` | 同 `--ease-standard` | 删除 |
| `--duration-terminal` | 同 `--dur-base` | 删除 |

步骤：
1. 全局搜索所有引用这些变量的 `.tsx`/`.ts`/`.css` 文件
2. 替换为语义正确的变量名
3. 从 `index.css` 中删除 compat alias 定义

#### 0.3 统一 `PHASE_ORDER` / `PHASE_LABELS`

当前重复定义在 5 个文件中（AppLayout.tsx、Dashboard.tsx、SidebarShell.tsx、TitleBar.tsx、Sidebar.tsx），内容不完全一致。

- 创建 `app/src/lib/phase-meta.ts`，导出统一的 `PHASE_ORDER` 和 `PHASE_LABELS`
- 所有文件改为 import

#### 0.4 统一 `enriched_path()`

`env.rs` 和 `claude_cli.rs` 各有一份实现，`env.rs` 版本不扫描 nvm 版本目录。

- `env.rs` 改为 `use crate::providers::claude_cli::enriched_path`
- 删除 `env.rs` 中的重复实现

#### 0.5 Rust 代码清理

- `config.rs`：4 处 `unwrap()` 替换为 `map_err(|e| e.to_string())?`
- `stream.rs`：`build_system_prompt` 移除未使用的 `config_dir` 参数，更新调用方
- `knowledge.rs`：`call_ai_via_cli` 中 `--dangerously-skip-permissions` 改为 `--allowedTools` 白名单（只允许读文件，不允许写/执行）
- API providers（`anthropic.rs`、`openai.rs`）：reqwest 客户端添加 `connect_timeout(30s)` + `timeout(600s)`
- `knowledge.rs`：`call_ai_via_api` 也添加超时

#### 0.6 前端架构清理

- `AppLayout.tsx`：DOM 查询获取项目名称 → 改为通过 React Context 或 zustand 共享
- `rarity-stripe-card.tsx`：评估是否重命名为 `AccentStripeCard`，`rarity` prop 改为 `variant`

### 第一步：扫描

扫描范围：`.tsx` + `.ts` + `.css` + `.rs`

#### Layer 1 — 高可信度自动检测（脚本/grep）

| 检测项 | 方法 | 可信度 |
|--------|------|--------|
| 硬编码色值（`#xxx`、`text-red-500` 等 Tailwind 色彩类） | 正则 | 高 |
| 引用了 `design-system.md` 中未定义的 CSS 变量 | 正则 + 白名单 | 高 |
| `tracking-[...]`（规范中无 letter-spacing） | 正则 | 高 |
| `as any` / `@ts-ignore` 逃逸标记 | grep | 高 |
| Rust `unwrap()` / `expect()` 在 Tauri command 中 | grep | 高 |
| 缺少超时的 reqwest 调用 | grep `Client::new()` | 高 |
| 仅含图标的 `<button>` 缺少 `aria-label` | AST 或正则 | 中 |

#### Layer 2 — 候选清单 + 人工/AI 确认

| 检测项 | 方法 | 说明 |
|--------|------|------|
| 圆角上下文（`rounded` vs `rounded-lg` vs `rounded-full`） | 正则生成候选 | 需判断组件类型 |
| `font-mono` 场景判断 | grep + 上下文 | `<code>`/`<pre>` 内合理，其他标记 |
| 微交互覆盖（button 缺 `active:scale-[0.97]`） | grep 统计 | 区分主操作/辅助操作 |
| 边界状态覆盖度（empty/loading/error state） | 逐页检查 | 搜索 loading/skeleton/empty 分支 |
| 文案一致性（"确定"vs"确认"、"取消"vs"关闭"） | 提取所有按钮文案 | 人工审查措辞统一性 |
| 响应式布局（最小窗口 900x600 下布局是否崩溃） | Playwright 截图 | 按 minWidth 配置测试 |

#### 白名单规则

- `DesignSpec.tsx` 的 Playground 预览区：允许硬编码色值（动态渲染用户上传的规范）
- `<code>`/`<pre>` 内部：允许 `font-mono`
- Markdown 渲染区：允许 `font-serif`（Lora）

### 第二步：按用户路径分级

梳理 3 条核心路径，同路径页面同批修复：

**路径 A：项目浏览与导航**
- Dashboard → 项目卡片 → 侧边栏导航 → 阶段切换
- 涉及：Dashboard.tsx、SidebarShell.tsx、Sidebar.tsx、AppLayout.tsx、ActivityBar.tsx

**路径 B：核心产出流程**
- 需求分析 → 竞品研究 → 用户故事 → PRD → 评审 → 复盘
- 涉及：Analysis.tsx、Research.tsx、Stories.tsx、Prd.tsx、Review.tsx、Retrospective.tsx

**路径 C：工具与设置**
- 设置页 → 知识库 → 优先级评估 → 周报 → 数据洞察
- 涉及：Settings.tsx、Knowledge.tsx、Priority.tsx、Weekly.tsx、DataInsight.tsx

优先级：路径 A > 路径 B > 路径 C

### 第三步：分两阶段修复

#### Phase A — 基础层（串行）

串行修复共享组件和全局样式，合并验证后才进入 Phase B。

| 文件 | 修复内容 |
|------|----------|
| `index.css` | 清除 compat alias（第零步如未完成） |
| `ui/button.tsx` | 移除 `--yellow-glow`，统一微交互 |
| `ui/badge.tsx` | 确认符合规范 |
| `ui/toast.tsx` | 确认符合规范 |
| `ui/skeleton.tsx` | 确认符合规范 |
| `ui/context-menu.tsx` | 确认符合规范 |
| `ui/tooltip.tsx` | 确认符合规范 |
| `AppLayout.tsx` | DOM 查询改 Context，更新通知已修复 |
| `lib/phase-meta.ts` | 新建统一常量（第零步） |
| `stage-nav.tsx` | 移除 `--yellow` 引用 |

验证：`tsc --noEmit` + `cargo check` + 截图关键页面

#### Phase B — 页面层（并行）

每个 Agent 拿到：
1. 目标文件路径
2. `docs/design-system.md` 完整内容
3. 该文件的具体问题清单（来自第一步扫描）
4. 修复规则：只使用 Phase A 已修复的组件 API，不覆写组件样式

Agent 修复范围：
- CSS 变量替换
- 圆角/字号/字重对齐
- 补充缺失的微交互
- 补充 `aria-label`
- 处理边界状态（empty/loading/error）
- 文案统一

禁止事项：
- 不修改 `ui/` 下的共享组件
- 不修改 `index.css`
- 不修改 `lib/` 下的工具函数

### 第四步：回归验证

| 验证项 | 方法 | 通过标准 |
|--------|------|----------|
| Rust 编译 | `cargo clippy -- -W clippy::all` | 零 warning |
| 前端编译 | `tsc --noEmit` | 零 error |
| 扫描复检 | 重跑第一步 Layer 1 扫描 | 问题数归零 |
| 视觉回归 | 修复前后 Playwright 截图 diff | diff 在预期范围内 |
| 暗色模式 | 切换到 dark theme 截图 | 无样式丢失 |
| 窗口缩放 | 900x600 最小尺寸截图 | 布局不崩溃 |
| 功能回归 | 核心路径手动走查 | 功能正常 |

## 三、预期产出

- 扫描报告：问题清单按文件/路径分组
- 修复 commit：按 Phase A / Phase B 分组提交
- 验证报告：截图 diff + 编译结果
- 后续改进项：大组件拆分、知识库索引优化等（记录但不在本次修复）
