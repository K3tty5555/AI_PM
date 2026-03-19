# 产品分身预览 + 设计规范 Playground — 设计文档

日期：2026-03-19

## 背景

两个工具页的内容展示需升级：
1. **产品分身**：展开后只显示 JSON 配置或描述文字，用户看不出分身实际写出来的风格
2. **设计规范**：设计师看 token JSON 和 README 文字无法直观感知视觉效果

---

## ① 产品分身 — 风格示例预览

### 方案

在分身目录新增 `sample.md`，存放一段用该风格实际写出来的 PRD 示例文字（约 150 字的功能需求描述）。展开卡片时优先展示 sample，让用户直接感知风格。

### 后端变更

`get_prd_style_content` 返回结构新增字段：

```rust
pub struct PrdStyleContent {
    pub config: String,
    pub profile: Option<String>,
    pub sample: Option<String>,   // 新增：sample.md 原文
    pub has_template: bool,
}
```

读取逻辑：`fs::read_to_string(style_dir.join("sample.md")).ok()`

### 前端变更

**Persona.tsx 展开区域优先级**：
- 有 `sample` → 渲染 `PrdViewer`，顶部显示标签"风格示例"
- 无 sample 有 `profile` → 渲染 `PrdViewer`，标签"风格档案"
- 都没有 → 渲染 config JSON 代码块，标签"风格配置"

**tauri-api.ts**：`PrdStyleContent` 接口新增 `sample?: string | null`

### 生成时机

`ai-pm-persona` skill 在生成 `style-profile.json` 后，额外生成一段示例文字存为 `sample.md`（格式：一个产品功能点的需求描述，约 150 字，体现措辞和结构习惯）。用户也可手动放文件。

---

## ② 设计规范 — Token Playground

### 方案

展开设计规范卡片后，在现有颜色色板下方增加 **Playground 区块**，纯前端解析 `design-tokens.json`，用 inline style 渲染组件预览，不依赖外部 CSS。

### 数据解析

扩展 `parseTokens(tokensRaw: string)` 函数，提取：
- `colors`：primary / secondary / semantic 颜色组
- `typography`：字号列表（fontSize 或 fontSizes）
- `borderRadius`：圆角值
- `shadows`：阴影值

### 前端渲染（DesignSpec.tsx）

展开区域结构：

**颜色系统**（优化现有）：
- 按 primary / secondary / semantic 分组显示
- 每个色块：色圆点 + 变量名 + hex 值

**字体排版**（新增）：
- 从 typography token 提取字号
- 渲染示例文字，字号用 token 值，颜色用 primary.main
- 示例：「这是标题 · 24px」「这是正文 · 14px」「这是辅助文字 · 12px」

**组件预览**（新增）：
- 按钮：Primary（品牌色）/ Secondary（边框）/ Danger（语义红）
- 输入框：默认态 + focus 边框色
- 状态徽章：Success / Warning / Error
- 卡片容器：borderRadius + shadow token 注入
- 全部 inline style 驱动，token 值直接注入

### token 结构容错

不同规范文件 key 名不统一，解析时做 fallback：
- 颜色：`colors` / `color` / `palette`
- 字号：`typography.sizes` / `fontSizes` / `typography.fontSize`
- 圆角：`borderRadius` / `radii` / `radius`
- 阴影：`shadows` / `shadow` / `elevation`

若某组 token 不存在，对应区块静默不显示。

---

## 涉及文件

| 文件 | 变更 |
|------|------|
| `app/src-tauri/src/commands/templates.rs` | PrdStyleContent 新增 sample 字段 |
| `app/src/lib/tauri-api.ts` | PrdStyleContent 接口新增 sample |
| `app/src/pages/tools/Persona.tsx` | 展开区域优先展示 sample，标签区分 |
| `app/src/pages/tools/DesignSpec.tsx` | Playground 区块：颜色分组 + 字体排版 + 组件预览 |
