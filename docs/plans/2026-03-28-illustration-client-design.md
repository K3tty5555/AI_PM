# 客户端 AI 文生图集成设计

> **状态:** 已审视 → 待实施
> **关联:** `project_illustration_client.md`（记忆文件）、`2026-03-27-illustration-gen-impl.md`（技能侧已完成）
> **审视:** 2026-03-28 四视角审视（架构师/后端/前端/UI-UX），25 项问题已全部修订

## 目标

在 Tauri 客户端中完整集成 AI 图片生成能力，覆盖五个子系统：Rust 后端 API 封装、Settings 配置、独立工具页、PRD 导出集成、图片内联预览。

## 关键决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| API 调用路径 | Rust 原生 reqwest | 单次请求，不需流式；无 Python/CLI 依赖 |
| API Key 存储 | .env 优先 + config.json 备选 | 兼容技能侧已有配置，客户端内也能配 |
| 工具页交互 | 输入 → 生成 → 画廊 | 图片生成不需多轮对话，画廊便于管理和引用 |
| 风格选择 | 智能推荐 + 手动覆盖 | 默认折叠给合理默认值，用户想调时展开 |
| PRD 导出 | 两步 Dialog | 保留现有 SensitiveScanDialog 不变，Mermaid 选择用独立 Dialog |
| 图片预览 | Tauri asset 协议 + Lightbox | 避免 base64 内存问题，复用现有 Dialog 模式 |
| Provider 支持 | 多 provider 数据结构，UI 只展示已实现的 | Seedream 先行，结构预留扩展 |
| 命令返回模式 | 同步返回 Result | 单次请求不需要事件模式，避免竞态和二义性 |

---

## Section 1：Rust 后端 — `commands/illustration.rs`

### 新增依赖

```toml
# Cargo.toml
base64 = "0.22"
dotenvy = "0.15"  # 解析 .env 文件
```

### 数据结构

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateIllustrationArgs {
    pub prompt: String,                // Mermaid 代码或自然语言
    pub style_preset: Option<String>,  // "corporate-memphis" 等
    pub layout: Option<String>,        // "linear-progression" 等
    pub size: Option<String>,          // 默认 "2560x1440"
    pub project_dir: Option<String>,   // 项目目录绝对路径（非 ID）
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IllustrationResult {
    pub file_path: String,
    pub thumb_path: String,       // 缩略图路径（256x256）
    pub width: u32,
    pub height: u32,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IllustrationEntry {
    pub file_path: String,
    pub thumb_path: String,       // 缩略图路径
    pub file_name: String,
    pub prompt: String,           // 从 .meta.json 读取；缺失时为空字符串
    pub created_at: String,
    pub size_bytes: u64,
}
```

### Tauri 命令

| 命令 | 功能 | 返回 |
|------|------|------|
| `generate_illustration` | 构建 prompt → reqwest POST（90s 超时）→ base64 解码 → 写 PNG + 缩略图 + .meta.json | `Result<IllustrationResult, String>` |
| `list_illustrations` | 扫描 11-illustrations/ 目录，分页返回 | `Result<Vec<IllustrationEntry>, String>` |
| `read_local_image` | 安全读取本地图片文件，返回 Tauri asset URL | `Result<String, String>` |
| `get_illustration_config` | 检测 provider/model/key 配置状态 | `IllustrationConfig`（Key 脱敏返回） |
| `save_illustration_config` | 保存配置到 config.json | `Result<(), String>` |
| `test_illustration_key` | 验证 Key 有效性（接受可选 Key 参数） | `Result<TestKeyResult, String>` |

**已删除的命令：**
- ~~`detect_mermaid_blocks`~~ — 移至前端实现（纯文本处理 + 业务规则映射，不需要 Rust）

### 命令返回模式

**不使用事件。** 图片生成是单次 API 调用（非流式），`generate_illustration` 直接返回 `Result<IllustrationResult, String>`。前端 `await safeInvoke()` 拿结果，loading 状态由 hook 的 `generating` 布尔值管理。

去掉事件的原因：
- 避免监听注册晚于事件发出的竞态
- 避免 await 返回值与事件之间的二义性
- 单次请求不需要中间进度

### API Key 读取优先级

1. 环境变量（如 `ARK_API_KEY`）
2. `~/.baoyu-skills/.env` 中对应变量（用 `dotenvy` 解析，仅支持 `KEY=VALUE` 格式）
3. `~/.config/ai-pm/config.json` 中的 `illustrationApiKey`

**安全规则：**
- `get_illustration_config` 返回给前端的 Key **必须脱敏**（前 4 位 + `****` + 后 4 位），与现有 `get_config` 的 `mask_key()` 一致
- `test_illustration_key` 接受可选 `api_key: Option<String>` 参数，允许测试用户刚输入但尚未保存的 Key
- 返回值中 `apiKeySource` 字段标注当前生效来源（`"env"` / `"env_file"` / `"config"` / `"none"`）

### `read_local_image` 安全约束

```rust
// 路径校验规则：
// 1. 必须在 $HOME 目录下
// 2. 拒绝包含 ".." 的路径
// 3. 仅允许后缀：.png, .jpg, .jpeg, .webp, .svg
// 4. 文件大小上限 20MB
// 5. 返回 Tauri convertFileSrc() 可用的 asset URL，不做 base64 转码
```

### Prompt 构建

- Mermaid 输入 → 前端传入已解析的图表类型 → Rust 按预设表拼接描述性 prompt
- 自然语言输入 → 前缀加通用约束："专业产品流程信息图，扁平矢量风格，纯白背景(#FFFFFF)，中文标注"

### HTTP 请求配置

```rust
let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(90))
    .build()?;

// 响应体大小校验：Content-Length 超过 50MB 则拒绝
// Seedream 返回 base64，2560x1440 PNG 约 10-15MB base64 文本
```

### 文件保存

- 项目内：`{project_dir}/11-illustrations/{NN}-{slug}.png` + `{NN}-{slug}.thumb.png` + `{NN}-{slug}.meta.json`
- 无项目上下文：`~/.config/ai-pm/illustrations/{timestamp}-{slug}.png` + `.thumb.png` + `.meta.json`
- 缩略图：生成时同步生成 256x256 缩略图（用 `image` crate 缩放）
- `.meta.json` 格式：

```json
{
  "version": 1,
  "prompt": "...",
  "style": "corporate-memphis",
  "layout": "linear-progression",
  "provider": "seedream",
  "model": "doubao-seedream-4-5-251128",
  "size": "2560x1440",
  "createdAt": "2026-03-28T10:30:00Z"
}
```

**文件编号并发保护：** 在 `AppState` 中加 `illustration_lock: Mutex<()>`，编号分配（扫描目录最大编号 +1）在锁内完成，防止快速多次生成导致编号重复。

### `list_illustrations` 分页

```rust
pub struct ListIllustrationsArgs {
    pub project_dir: Option<String>,
    pub offset: usize,     // 默认 0
    pub limit: usize,      // 默认 50，上限 100
}
```

按创建时间倒序返回。`.meta.json` 缺失时从文件属性构建降级条目（文件名作 prompt 占位，修改时间作 createdAt），不报错不跳过。

### Provider 注册表

```rust
pub struct ProviderDef {
    pub id: String,
    pub name: String,
    pub endpoint: String,
    pub models: Vec<ModelDef>,
    pub sizes: Vec<String>,
    pub env_key_name: String,
    pub env_file_path: Option<String>,  // 仅需要额外 env 文件的 provider 填写
    pub implemented: bool,              // UI 只展示 implemented=true 的
}
```

初始版本只注册 Seedream（`implemented: true`）。数据结构支持多 provider，但 UI 和调用逻辑只处理 `implemented=true` 的。新增 provider 时加一条注册 + 实现调用逻辑即可。

---

## Section 2：前端 — 独立工具页 `/tools/Illustration`

### 页面标题

**"AI 插图工具"**（非"AI 流程图生成"），与路由名 `Illustration` 对齐。副标题："当前支持 Mermaid 流程图转图片和自然语言描述生成"，为后续扩展留空间。

### 页面结构

```
┌─────────────────────────────────────────────┐
│  AI 插图工具                  [项目选择器(可选)]│
│  当前支持 Mermaid 流程图和自然语言描述生成      │
├─────────────────────────────────────────────┤
│  输入区                                       │
│  [Mermaid / 自然语言] SegmentedControl        │
│  textarea                                     │
│  （Mermaid 语法错误时：底部红色提示 + 禁用生成）│
│                                               │
│  风格：推荐风格 Badge    [调整风格 ▸] 折叠     │
│  （展开后：radiogroup 卡片 + 自定义输入框）     │
│                                               │
│  [生成插图] 主按钮  |  生成中：[取消]          │
│                                               │
│  结果区                                       │
│  ├ 生成中：进度文案 "AI 绘制中..."             │
│  ├ 成功：图片 + 路径 + [复制引用] (tooltip预览)│
│  ├ 失败：error 卡片 + 原因 + [重试]           │
│  └ 超时：30s 提示耐心等待，60s 提供取消        │
│                                               │
│  ── 历史插图 ──                               │
│  3 列缩略图网格（缩略图用 asset 协议加载）      │
│  hover 右上角操作按钮 | 键盘 Tab/Enter/Delete  │
│  空状态：引导文案 + fadeInUp 动画               │
│  >20 张时顶部显示筛选条                        │
└─────────────────────────────────────────────┘
```

### 交互流程

1. 用户选择输入模式（Mermaid / 自然语言），输入内容
2. **Mermaid 输入** → 前端本地正则检测图表类型 → 风格行显示推荐 Badge（如"推荐：corporate-memphis"），面板保持折叠，用户点"调整风格"才展开
3. **自然语言** → 风格行显示默认值，同样可展开调整
4. **两种模式下风格面板行为一致**：默认折叠给合理默认值，展开后显示预设卡片 + 自定义输入
5. 点击"生成" → 按钮变为"取消"按钮 → 进度文案："AI 绘制中..." → "即将完成..." → "保存到项目..."
6. 完成 → 结果区显示图片 + 文件路径 + "复制引用"按钮
7. 图片加入历史画廊

### Mermaid 检测（前端实现）

```typescript
// 纯前端正则，不调 Rust
function detectMermaidType(code: string): string {
  const firstLine = code.trim().split('\n')[0].trim()
  for (const type of ['sequenceDiagram', 'flowchart', 'classDiagram', 'graph']) {
    if (firstLine.startsWith(type)) return type
  }
  return 'graph'
}

// 风格推荐映射表（前端维护，调整无需重编译）
const STYLE_RECOMMENDATIONS: Record<string, { layout: string; style: string }> = {
  'graph':           { layout: 'linear-progression', style: 'corporate-memphis' },
  'flowchart':       { layout: 'linear-progression', style: 'corporate-memphis' },
  'sequenceDiagram': { layout: 'linear-progression', style: 'technical-schematic' },
  'classDiagram':    { layout: 'structural-breakdown', style: 'technical-schematic' },
}
```

### 风格推荐面板

- 默认折叠，显示当前选中风格的 Badge + "调整风格"展开链接
- 展开后：`role="radiogroup"` 语义，每个卡片 `role="radio"` + `aria-checked`
- 方向键切换焦点，推荐项带 Badge 标记"推荐"（`aria-label` 关联）
- 末尾"自定义"选项展开文本输入框
- 折叠时使用推荐默认值，展开后使用用户选择

### Hook

```typescript
function useIllustration() {
  // 基于 safeInvoke 封装，不使用事件
  return {
    generating: boolean,
    result: IllustrationResult | null,
    error: string | null,
    generate: (args: GenerateIllustrationArgs) => Promise<void>,
    cancel: () => void,     // 取消正在进行的请求
    reset: () => void,
  }
}
```

`cancel` 通过 `AbortController` 模式实现——设置 `cancelled` flag，`generate` 在 await 返回后检查 flag，若已取消则丢弃结果。

### 项目选择器

- 标注为**可选**，未选择时图片保存到全局目录 `~/.config/ai-pm/illustrations/`
- "复制引用"按钮：无项目时 disabled + tooltip "请先选择关联项目"
- 参考 `ToolDataPage` 中 `boundProjectId` 的可选模式

### 历史画廊

- 缩略图用 **Tauri `convertFileSrc()` + asset 协议**加载 `.thumb.png`，不做 base64 转码
- 并发加载用 `IntersectionObserver` 懒加载（复用 `useLazyRender` 模式）
- 超过 20 张时顶部显示搜索/筛选条（按项目、按时间范围）
- 每张 hover 时右上角显示操作按钮（删除、复制路径），作为右键菜单的替代入口
- 键盘：Tab 聚焦网格项，Enter 放大，Delete 删除
- 右键菜单复用 `context-menu` 组件：复制引用路径 / 在 Finder 中显示 / 删除
- **空状态：** 居中图标 + "还没有生成过插图，试试上方的输入框" + `fadeInUp` 动画

### 进度文案（Humanizer-zh）

| 技术状态 | 用户文案 |
|---------|---------|
| requesting | "AI 绘制中..." |
| decoding | "即将完成..." |
| saving | "保存到项目..." |
| 超过 30s | "生成时间较长，请耐心等待" |
| 超过 60s | 显示"取消"按钮 |

### 边界状态

| 状态 | UI 表现 |
|------|---------|
| API Key 未配置 | 输入区上方 warning 横幅："请先在设置中配置图片生成 API Key"，点击跳转 Settings |
| 生成失败（网络） | 结果区 error 卡片（红色左侧条）+ 错误原因 + "重试"按钮 |
| 生成失败（余额不足） | error 卡片 + "API 余额不足，请检查账户" |
| 生成失败（Key 无效） | error 卡片 + "API Key 无效，请在设置中重新配置" + 跳转链接 |
| Mermaid 语法错误 | textarea 下方红色提示 + 禁用"生成"按钮 |
| 画廊为空 | 空状态组件（图标 + 引导文案 + fadeInUp） |
| 项目选择器无项目 | 下拉显示"无项目，图片将保存到全局目录" |

---

## Section 3：PRD 导出 — Mermaid 图片选择

### 方案变更

**保留现有 `SensitiveScanDialog` 不变。** 不做合并重构，改为两步 Dialog：

```
导出按钮点击
    ↓
并行调用 scanSensitive() + 前端检测 Mermaid 代码块
（用 Promise.allSettled，任一失败视为空结果，10s 超时兜底）
    ↓
Step 1: 有敏感信息 → 弹 SensitiveScanDialog（现有组件，不改动）
        无敏感信息 → 跳过
    ↓
Step 2: 有 Mermaid 代码块 → 弹 MermaidRenderDialog（新组件）
        无 Mermaid → 跳过
    ↓
两步都跳过 → 直接导出
任一步用户取消 → 中止导出
```

### MermaidRenderDialog

```typescript
interface MermaidRenderDialogProps {
  open: boolean
  blocks: MermaidBlock[]    // 前端检测的 Mermaid 代码块
  onConfirm: (choices: MermaidExportChoices) => void
  onCancel: () => void
}

interface MermaidBlock {
  index: number
  lineNumber: number
  code: string
  chartType: string
  recommendedLayout: string
  recommendedStyle: string
}

interface MermaidExportChoices {
  // Record 而非 Map，兼容 JSON 序列化和 safeInvoke
  renderModes: Record<number, "ai" | "local" | "skip">
  aiStyles: Record<number, { layout: string; style: string }>
}
```

### Dialog 布局

```
┌─ 流程图渲染方式 ────────────────────────────┐
│                                               │
│ 默认渲染方式：[本地渲染 ▾]  ← 全部应用下拉     │
│                                               │
│ ┌───────────────────────────────────────────┐ │
│ │ #1 graph（第 28 行） [AI 生成 ▾][本地][跳过]│ │
│ │    选 AI 时展开：推荐风格 Badge + [调整]    │ │
│ │                                           │ │
│ │ #2 sequenceDiagram（第 67 行）  ...        │ │
│ │                                           │ │
│ │ #3 flowchart（第 112 行）      ...        │ │
│ └───────────────────────────────────────────┘ │
│                                               │
│  ⓘ 选择"AI 生成"将调用 API，会产生少量费用     │
│                                               │
│         [取消]                      [导出]    │
└─────────────────────────────────────────────┘
```

### 交互细节

- 顶部"默认渲染方式"下拉：选择后**批量应用**到所有代码块（减少逐项决策负担）
- 用户可逐项覆盖
- 选"AI 生成"时展开风格推荐（和工具页一致的折叠推荐模式）
- 默认选项：本地渲染（免费）
- 底部提示费用信息
- 每个区块显示汇总状态（如"2 个 AI 生成 / 1 个本地"）

### Mermaid 检测

在 Prd.tsx 中，导出前直接从已有的 PRD markdown 文本用前端正则提取，不调 Rust：

```typescript
function extractMermaidBlocks(markdown: string): MermaidBlock[] {
  const blocks: MermaidBlock[] = []
  const regex = /```mermaid\s*\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  let index = 0
  while ((match = regex.exec(markdown)) !== null) {
    const lineNumber = markdown.substring(0, match.index).split('\n').length
    const code = match[1].trim()
    const chartType = detectMermaidType(code)
    const rec = STYLE_RECOMMENDATIONS[chartType] || STYLE_RECOMMENDATIONS['graph']
    blocks.push({ index: index++, lineNumber, code, chartType, ...rec })
  }
  return blocks
}
```

### 错误处理

- `scanSensitive()` 失败 → 跳过敏感检查，Mermaid 步骤正常进行（与现有行为一致）
- Mermaid 检测失败 → 跳过 Mermaid 选择，直接导出
- 两者都超时（10s）→ 直接导出，Toast 提示"预检超时，已跳过检查"

---

## Section 4：Settings 配置

### 位置

Settings → "API 配置" Tab（`SettingsApi.tsx`）中，作为独立的 `Card` 组件，与"AI 后端"Card 并列。复用 `Card` + `CardHeader` + `CardContent` + `CardFooter` 现有模式。

### 布局

```
┌─ Card: AI 图片生成 ─────────────────────────┐
│                                               │
│  服务商   [Seedream (火山引擎) ▾]              │
│           （仅展示已实现的 provider）           │
│                                               │
│  模型     [doubao-seedream-4-5-251128 ▾]      │
│           （根据服务商切换可选列表）            │
│                                               │
│  API Key                                      │
│  ├ 已从 .env 检测到时：                        │
│  │ [输入框 readonly] Badge:"来源：.env" (绿色) │
│  │ hint: "如需更改请编辑 ~/.baoyu-skills/.env" │
│  ├ 已从 config 配置时：                        │
│  │ [输入框 可编辑] Badge:"来源：应用配置"       │
│  └ 未配置时：                                  │
│    [输入框 可编辑] Badge:"未配置" (黄色)        │
│                                               │
│  默认尺寸 [2560×1440 ▾]                       │
│                                               │
│  CardFooter:                                  │
│  [测试连接]  ← loading/success/error 反馈     │
│  自动保存（防抖 500ms）+ "已保存" 提示          │
└─────────────────────────────────────────────┘
```

### 配置结构

```typescript
interface IllustrationConfig {
  provider: string
  model: string
  apiKeyMasked: string | null   // 脱敏后的 Key（前4****后4）
  apiKeySource: "env" | "env_file" | "config" | "none"
  defaultSize: string
  availableProviders: ProviderDef[]  // 仅 implemented=true 的
}

interface ProviderDef {
  id: string
  name: string
  models: { id: string; name: string }[]
  sizes: string[]
  envKeyName: string
}

interface TestKeyResult {
  valid: boolean
  message: string         // "API Key 有效" / "API Key 无效或已过期" / "网络不可达"
  costWarning: boolean    // true 时前端提示"此操作可能产生少量费用"
}
```

### 交互反馈

- **测试连接按钮**：
  - 点击前：如选中 provider 的测试会产生费用，tooltip 提示"测试会发送一个最小请求，可能产生少量费用"
  - 点击后：按钮变 spinner
  - 成功：`success` Toast + 按钮旁绿色 CheckCircle 图标持续 3s
  - 失败：`error` Toast + 按钮下方红色错误原因
- **`test_illustration_key`** 接受可选 `apiKey` 参数，允许测试用户刚输入但尚未保存的 Key
- **表单变更**：防抖 500ms 自动保存，右上角显示"保存中..." → "已保存"

---

## Section 5：图片内联预览

### `LocalImage` 组件

新建通用组件，管理 loading / loaded / error 三态：

```typescript
interface LocalImageProps {
  src: string           // 本地文件路径
  alt: string
  className?: string
  onClick?: () => void  // 点击放大
}

// 内部状态：loading → loaded / error
// loading：Skeleton 占位
// loaded：<img> 渲染（src 通过 convertFileSrc() 转 asset URL）
// error：占位符组件
```

### PRD 页面

`PrdViewer` 的 Markdown 渲染管线中注册自定义 image renderer：
- `src` 非 `http(s)://` 开头 → 替换为 `LocalImage` 组件
- 路径解析规则：只处理项目内 `11-illustrations/` 目录下的引用（项目目录 + 相对路径），其他路径原样渲染

### 图片不存在占位符

```
┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐
╎  [ImageOff 图标]            ╎  虚线边框
╎  图片未找到                 ╎  --secondary 背景
╎  11-illustrations/01-xx.png ╎  --text-tertiary 12px 路径
╎  [重新生成]                 ╎  文本链接（如对应 Mermaid 源码存在）
└╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘
```

### Lightbox 放大组件

复用现有 Dialog 组件模式（`SensitiveScanDialog` 的 backdrop 逻辑）：

- 遮罩：`rgba(0,0,0,0.3)` + `backdrop-blur(4px)`（设计规范 Dialog 标准）
- 进入动画：`dialogIn`
- 关闭方式：点击遮罩 / 右上角关闭按钮 / Escape 键
- 图片：`max-width: 90vw; max-height: 85vh; object-fit: contain`
- 底部信息栏：文件名 / 尺寸 / 创建时间（`--text-secondary` 13px）
- 大图加载中：Skeleton 占位

### 图片加载优化

- 所有缩略图通过 **Tauri `convertFileSrc()`** 加载 `.thumb.png`，不做 base64 转码
- `LocalImage` 内部使用 `convertFileSrc()` 转换路径
- 并发控制：实现 `imageLoader` 工具函数，内置并发上限（3 路）+ LRU 缓存（50 条），所有需要加载本地图片的场景统一走此 loader

---

## 数据流总览

```
Settings 配置
    → Rust config.rs 读写 config.json
    → illustration.rs 读取 provider/model/key

工具页生成
    → React useIllustration hook
    → await safeInvoke("generate_illustration", args)
    → Rust reqwest → Provider API → base64 解码 → 写 PNG + thumb + meta
    → 返回 Result<IllustrationResult>
    → React 更新 UI（success / error）

PRD 导出
    → 导出按钮 → Promise.allSettled(scanSensitive(), 前端 Mermaid 检测)
    → Step 1: SensitiveScanDialog（现有，不改）
    → Step 2: MermaidRenderDialog（新组件）
    → 导出命令携带 choices
    → Rust 侧按选择对每个 Mermaid 块调 generate_illustration 或 render_mermaid

图片预览
    → PrdViewer 自定义 image renderer
    → LocalImage 组件 → convertFileSrc() → Tauri asset 协议
    → 点击 → Lightbox 放大
```

## 组件复用清单

| 新组件 | 复用的现有组件/模式 |
|--------|-------------------|
| 风格卡片 radiogroup | `SegmentedControl` 的 ARIA 模式 |
| `MermaidRenderDialog` | `SensitiveScanDialog` 的 Dialog shell |
| `Lightbox` | `SensitiveScanDialog` 的 backdrop + Escape + `aria-modal` |
| `LocalImage` | 新建独立组件 |
| 历史画廊右键菜单 | `context-menu` 组件 |
| 工具页布局 | `ToolDataPage` 的 phase-shell + 项目选择器模式 |
| Settings Card | `SettingsApi` 的 Card 模式 |
| 进度反馈 | `ProgressBar` + Toast |

## 不做的事（YAGNI）

- 不做图片编辑/裁剪
- 不做缩放拖拽查看器
- 不做图片云存储/同步
- 不做批量生成
- 不做图片格式转换
- 暂不实现 Seedream 以外的 provider 调用逻辑（只预留数据结构）
- 不在 UI 中展示未实现的 provider
