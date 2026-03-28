---
name: ai-pm-pptx
description: >-
  PRD 转 PPT 演示文稿。读取 PRD Markdown，自动提取章节，生成幻灯片大纲，
  输出 .pptx 文件。支持 18 套配色方案和 4 种风格。
  当用户说「生成PPT」「导出PPT」「做个演示文稿」「PRD转PPT」时使用。
argument-hint: "[PRD路径]"
allowed-tools: Read Write Edit Bash(python3) Bash(pip3) Bash(mkdir) Bash(ls) Agent
---

# PRD 转 PPT 演示文稿

## 命令路由

- `/ai-pm pptx` — 从当前项目 PRD 生成
- `/ai-pm pptx [路径]` — 从指定 PRD 文件生成

## 三层编排

### 1. 规划层：PRD → 幻灯片大纲

读取 PRD Markdown，提取 `##` 标题作为章节。每个章节映射为：
- 1 个 Section 页（章节标题）
- N 个 Content 页（章节内的要点，每页 3-5 条）

自动添加 Cover 页（产品名 + 副标题）和 End 页（联系方式/感谢）。

输出 `outline.json`：
```json
[
  { "page_type": "cover", "title": "产品名", "bullets": ["副标题"], "sub_layout": null },
  { "page_type": "section", "title": "章节标题", "bullets": [], "sub_layout": null },
  { "page_type": "content", "title": "要点标题", "bullets": ["要点1", "要点2"], "sub_layout": "bullet-list" },
  { "page_type": "end", "title": "谢谢", "bullets": ["联系方式"], "sub_layout": null }
]
```

### 2. 设计层：配色 + 风格推荐

根据项目行业（`industry-style-presets.json`）自动推荐配色方案和风格：

| 行业 | 推荐配色 | 推荐风格 |
|------|---------|---------|
| finance | business-authority | corporate |
| healthcare | modern-health | clean |
| tech | tech-blue | modern |
| education | vintage-academic | classic |
| ecommerce | bohemian | creative |
| enterprise | platinum-white-gold | corporate |
| general | tech-blue | modern |

用户可覆盖推荐，从 18 套配色中任选。

→ 详见 `references/design-system.md`

### 3. 生成层：编译 .pptx

调用 Python 脚本：

```bash
python3 .claude/skills/ai-pm-pptx/scripts/prd2pptx.py \
  --input <prd.md> \
  --output <output.pptx> \
  --outline <outline.json> \
  --color-scheme <scheme-name> \
  --style <style-name> \
  --font-zh <中文字体> \
  --font-en <英文字体>
```

生成后调用 QA 流程：

```bash
python3 .claude/skills/ai-pm-pptx/scripts/verify.py <output.pptx>
```

## 执行步骤

### 步骤 1：确定 PRD 来源

- 有参数：使用指定路径
- 无参数：从当前项目的 `05-prd/05-PRD-v1.0.md` 读取
- 找不到 PRD：提示用户先完成 Phase 5

### 步骤 2：生成大纲

解析 PRD Markdown → 生成 `outline.json` → 展示给用户确认：

```
幻灯片大纲（共 {N} 页）：
1. [Cover] 产品名
2. [Section] 一、产品概述
3. [Content] 产品定位与目标
...

请确认大纲，或告诉我需要调整的地方。
```

### 步骤 3：选择设计方案

系统推荐 → 用户确认或自定义：

```
根据项目行业「{industry}」，推荐设计方案：
- 配色：{scheme_name}（{5色预览}）
- 风格：{style_name}
- 字体：{font_zh} / {font_en}

确认使用推荐方案，还是自定义？
```

### 步骤 4：生成 PPT

调用 `prd2pptx.py` → 运行 `verify.py` QA 检查 → 输出结果：

```
PPT 已生成！
- 文件：{output_path}
- 页数：{slide_count}
- 配色：{scheme_name}
- QA：{pass/fail}
```

### 步骤 5：后续操作

- 在 Finder 中打开
- 重新生成（换配色/风格）
- 手动调整大纲后重新生成

## 依赖

- `python-pptx`（必须）：`pip3 install python-pptx`
- `markitdown`（可选，用于 QA 验证）：`pip3 install markitdown`

## 参考文档

- `references/design-system.md` — 18 套配色方案 + 4 种风格
- `references/page-types.md` — 5 种页面类型及布局规则
- `references/pitfalls.md` — python-pptx 常见坑
- `references/qa-workflow.md` — QA 验证流程
