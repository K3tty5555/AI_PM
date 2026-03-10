---
name: ai-pm-prd
description: PRD 生成技能。整合需求分析、竞品研究、用户故事，输出完整的产品需求文档。支持产品分身写作风格和设计规范。
argument-hint: "[项目目录路径 | --style=风格名]"
allowed-tools: Read Write Edit Bash(mkdir) Bash(ls) Bash(cat) Bash(node) Bash(rm)
---

# PRD 生成

## 输入

- `{项目目录}/02-analysis-report.md`（需求分析，必需）
- `{项目目录}/03-competitor-report.md`（竞品研究，如有）
- `{项目目录}/04-user-stories.md`（用户故事，如有）
- `templates/prd-styles/{风格名}/style-config.json`（写作风格，可选）

## 输出

`{项目目录}/05-prd/05-PRD-v1.0.md`

目录结构：
```
{项目目录}/05-prd/
├── README.md
└── 05-PRD-v1.0.md
```

## 执行步骤

### 步骤1：读取风格配置（可选）

检查是否有 `--style` 参数或 `$PM_STYLE` 环境变量，若有则读取对应的 `style-config.json` 并应用：
- 章节顺序（`structure.chapterOrder`）
- 优先级术语（P0/P1/P2 或 高/中/低）
- 表格字段（`formatting.tableFields`）
- 内容侧重（`contentFocus`：用户故事篇幅、指标详细程度等）

### 步骤2：读取所有输入文档，整合信息

### 步骤3：按 8 章结构生成 PRD

```
mkdir -p {项目目录}/05-prd/
```

生成 `05-PRD-v1.0.md` 并创建 `README.md`（说明目录用途）。

### 步骤4：完成提示

输出 PRD 关键摘要（功能数量、P0 数量、核心指标）。

## PRD 8 章结构

```markdown
# {产品名}需求文档

## 一、文档概述
### 1.1 评审/修订日志
| 日期 | 修订版本 | 修改描述 | 涉及影响模块 | 作者 | 备注 |
|------|---------|---------|-------------|------|------|
| {日期} | v1.0 | 初稿创建 | - | AI_PM | - |

## 二、需求分析
### 2.1 需求背景
**需求来源**：{市场反馈 / 主动规划 / 内部优化}
**目标用户及场景**：{用户画像} + {具体场景}
**需求痛点**：{详细描述，引用需求分析报告}

### 2.2 需求价值
**定性描述**：{产品价值}
**定量指标**：
| 指标类型 | 指标名称 | 目标值 | 验收标准 |
|---------|---------|-------|---------|
**优先级**：{P0/P1/P2}

## 三、功能清单
### 3.1 主要功能说明
| 模块 | 功能 | 子功能 | 描述 | 优先级 | 备注 |
|------|------|--------|------|--------|------|
- P0：核心功能，必须实现
- P1：重要功能，建议实现
- P2：增值功能，可选实现

## 四、产品流程
### 4.1 业务流程图
{Mermaid 流程图或文字描述}

### 4.2 页面流程图
{页面跳转逻辑}

## 五、全局说明
### 5.1 名词解释
| 术语 | 解释 |
|------|------|

### 5.2 公共交互说明
{弹窗、Toast、键盘交互等全局规则}

### 5.3 统一异常处理
| 异常类型 | 触发条件 | 处理方式 | 提示文案 |
|---------|---------|---------|---------|

### 5.4 列表默认数据与分页
{默认排序、空状态、分页规则}

## 六、详细功能设计
### 6.1 {功能名称}
| 项目 | 说明 |
|------|------|
| 用户场景 | {场景描述} |
| 功能描述 | {功能描述} |
| 优先级 | P0/P1/P2 |
| 输入/前置条件 | {前置条件} |
| 需求描述（基本事件流） | {步骤列表} |
| 需求描述（异常事件流） | {异常处理} |
| 输出/后置条件 | {后置条件} |
| 用户权限 | {哪些角色可用} |
| 补充说明 | {其他注意事项} |

## 七、效果验证
### 7.1 指标及定义
| 指标分类 | 指标名称 | 定义 | 计算方式 | 目标值 |
|---------|---------|-----|---------|-------|

### 7.2 数据埋点
| 埋点事件 | 触发时机 | 事件参数 | 备注 |
|---------|---------|---------|------|
事件命名规范：{module}_{action}_{object}

## 八、非功能性说明
### 8.1 性能需求
| 指标 | 要求 |
|------|------|
| 页面加载 | < 2s |
| 接口响应 | < 500ms |

### 8.2 兼容性
{浏览器/设备要求}

### 8.3 安全需求
{数据加密、权限控制、合规要求}

### 8.4 未来规划
| 版本 | 规划功能 | 预计时间 |
|------|---------|---------|
```

## 版本策略

- 首次生成：创建 v1.0，修订日志记录"初稿创建"
- 评审后修改：**不创建新文件**，在原文档直接修改，修订日志追加新记录（v1.1、v1.2...）
- 不生成 `.bak` 备份文件，Git 历史已足够

## 导出格式（可选）

| 命令 | 输出 |
|------|------|
| `--export=pdf` | 生成 `05-PRD-v1.0.pdf`，应用 `pdf-style.css` |
| `--export=feishu` | 生成飞书云文档优化版 Markdown |
| `--export=all` | 同时生成所有格式 |

### PDF 导出实现

**依赖**：Node.js（已内置）+ 系统 Chromium（`~/Library/Caches/ms-playwright/chromium-1212/`）

**步骤**：

1. 读取 `templates/prd-styles/{风格名}/pdf-style.css`（默认用 `default`）
2. 用内联 Node.js 脚本把 PRD Markdown 转为 HTML，将 CSS 直接嵌入 `<style>` 标签
3. 调用 Chrome headless `--print-to-pdf` 输出 PDF
4. 删除临时 HTML 文件

**实现模板**：

```bash
# 步骤1：生成带样式的临时 HTML
node -e "
const fs = require('fs');
const md = fs.readFileSync('{项目目录}/05-prd/05-PRD-v1.0.md', 'utf8');
const css = fs.readFileSync('{CSS路径}/pdf-style.css', 'utf8');

// 基础 Markdown 转 HTML（标题/表格/列表/粗体/代码块/分隔线）
let html = md
  .replace(/^### (.+)$/gm, '<h3>$1</h3>')
  .replace(/^## (.+)$/gm, '<h2>$1</h2>')
  .replace(/^# (.+)$/gm, '<h1>$1</h1>')
  .replace(/\*\*(.+?)\*\*/g, '<strong>\$1</strong>')
  .replace(/\`(.+?)\`/g, '<code>\$1</code>')
  .replace(/^---$/gm, '<hr>')
  .replace(/^- (.+)$/gm, '<li>\$1</li>')
  .replace(/(<li>.*<\/li>\n?)+/g, '<ul>\$&</ul>')
  .split('\n\n').map(block => {
    if (block.match(/^<(h[1-4]|ul|hr|pre)/)) return block;
    if (block.includes('|')) return convertTable(block);
    return '<p>' + block + '</p>';
  }).join('\n');

function convertTable(block) {
  const rows = block.trim().split('\n').filter(r => !r.match(/^\|[-| ]+\|$/));
  if (rows.length < 1) return block;
  const header = rows[0].split('|').filter(c => c.trim()).map(c => '<th>' + c.trim() + '</th>').join('');
  const body = rows.slice(1).map(r => '<tr>' + r.split('|').filter(c => c.trim()).map(c => '<td>' + c.trim() + '</td>').join('') + '</tr>').join('');
  return '<table><thead><tr>' + header + '</tr></thead><tbody>' + body + '</tbody></table>';
}

const output = '<!DOCTYPE html><html lang=\"zh-CN\"><head><meta charset=\"UTF-8\"><style>' + css + '</style></head><body>' + html + '</body></html>';
fs.writeFileSync('{项目目录}/05-prd/_tmp_prd.html', output);
"

# 步骤2：Chrome headless 打印 PDF
CHROME=~/Library/Caches/ms-playwright/chromium-1212/chrome-mac-arm64/"Google Chrome for Testing.app"/Contents/MacOS/"Google Chrome for Testing"
"$CHROME" --headless=new --no-sandbox --disable-gpu \
  --print-to-pdf="{项目目录}/05-prd/05-PRD-v1.0.pdf" \
  --print-to-pdf-no-header \
  "file://{项目目录}/05-prd/_tmp_prd.html" 2>/dev/null

# 步骤3：清理临时文件
rm "{项目目录}/05-prd/_tmp_prd.html"
```

**注意事项**：
- 上面的 Node.js 转换脚本是简化版，处理常见 Markdown 语法足够，但嵌套列表、复杂代码块等边界情况建议先用 `marked`（已在 `/tmp/node_modules/marked` 缓存），复杂文档时优先使用
- `marked` 版本：`require('/tmp/node_modules/marked')`，若缓存失效则先 `cd /tmp && npm install marked`
- Chrome 路径仅适用于 macOS，Windows/Linux 路径不同
