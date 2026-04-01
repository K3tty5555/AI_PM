# /ai-pm illustration — AI 流程图生成

## 命令

`/ai-pm illustration <输入>`

## 功能

用 AI（baoyu-imagine）生成高质量信息图/流程图。支持 Mermaid 代码和自然语言两种输入，自动检测。

## 输入自动检测

| 输入特征 | 模式 | 处理方式 |
|---------|------|---------|
| 包含 `graph` / `sequenceDiagram` / `flowchart` / `classDiagram` | Mermaid | 解析代码结构 → 生成描述性 prompt |
| 其他文本 | 自然语言 | 直接用用户描述构建 prompt |

## 执行流程

### 1. 接收输入

用户贴 Mermaid 代码或用自然语言描述流程。

### 2. 分析内容 & 推荐风格

根据内容自动推荐布局×风格组合：

| 内容特征 | 推荐布局 | 推荐风格 |
|---------|---------|---------|
| 线性流程（步骤1→2→3） | linear-progression | corporate-memphis |
| 分支决策（if/else） | tree-branching | corporate-memphis |
| 时序交互（A→B→C→A） | linear-progression | technical-schematic |
| 循环流程 | circular-flow | corporate-memphis |
| 层级结构 | hierarchical-layers | corporate-memphis |
| 对比（A vs B） | binary-comparison | corporate-memphis |

默认配色：蓝色系（#1D4ED8 主色）。

### 3. 风格确认（必须）

**每次花钱之前都让用户确认风格，避免生成后不满意浪费费用。**

```
推荐方案：
  布局：{推荐布局}（{理由}）
  风格：{推荐风格}
  配色：{推荐配色}
  尺寸：2560×1440（16:9）

  1. 确认生成
  2. 看其他推荐（列出 3 个备选组合）
  3. 自定义要求（自由描述风格）
选择（默认 1）：
```

### 4. 生成图片

用户确认风格后，构造 prompt 并通过 baoyu-imagine 生成图片：

**4.1 构造 prompt**

基础 prompt 格式（与 SKILL.md 步骤6.2 保持一致）：

```
专业产品流程信息图，扁平矢量 {风格} 风格，纯白色背景(#FFFFFF)，蓝色系配色(主色#1D4ED8)，{布局} 布局，{内容描述}，无文字水印，高分辨率，2560x1440
```

**4.2 创建 prompt 文件**

将 prompt 写入 `/tmp/mermaid-prompts/{编号}-prompt.md`。

**4.3 构建 batch.json**

```json
{
  "tasks": [
    {
      "id": "{编号}",
      "prompt": "{构造好的 prompt}",
      "output": "{项目目录}/11-illustrations/{编号}-{slug}.png",
      "size": "2560x1440"
    }
  ]
}
```

将 batch.json 写入 `/tmp/mermaid-prompts/batch.json`。

**4.4 调用 baoyu-imagine**

```bash
~/.bun/bin/bun ~/.claude/skills/baoyu-imagine/scripts/main.ts --batchfile /tmp/mermaid-prompts/batch.json
```

**错误处理**：
- API Key 未配置 → 提示设置 `~/.baoyu-skills/.env` 中的 `ARK_API_KEY`
- 生成失败 → **不自动重试**（避免双倍费用），提示用户决定是否重试
- 网络超时 → 提示检查网络

### 5. 保存图片

baoyu-imagine 将图片直接输出到 batch.json 中指定的路径（`{项目目录}/11-illustrations/{编号}-{slug}.png`）。

编号规则：扫描目录已有文件最大编号 +1。slug 从内容提取 2-4 个关键词（kebab-case）。

### 6. 输出

显示图片路径，提示引用方式：
```
✅ 图片已生成: 11-illustrations/04-auth-flow.png

在 PRD 中引用：
![授权流程](../11-illustrations/04-auth-flow.png)
```

## 与导出流程的关系

- **独立命令**：用户主动调用，不需要费用确认（主动调用即视为同意）
- **导出流程**：md2docx.py 检测到 Mermaid 时询问 A（AI付费）/ B（本地免费），选 A 后确认风格
- 两者共用同一套风格推荐逻辑，图片生成均通过 baoyu-imagine 完成（保持与 SKILL.md 步骤6相同的质量和配置）
