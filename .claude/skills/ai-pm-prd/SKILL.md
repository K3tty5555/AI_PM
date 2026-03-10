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

### 步骤4：完成提示 + PDF 导出询问

输出 PRD 关键摘要后，询问是否导出 PDF：

```
✅ PRD 已生成：05-prd/05-PRD-v1.0.md
   功能模块：{N} 个 | P0：{N} 项 | 核心指标：{N} 条

是否需要导出 PDF？

  A. 纯文字版（立即，约 5 秒）
  B. 含原型截图版（约 30-40 秒）  ← 仅当 06-prototype/screenshots/manifest.json 存在时显示
  C. 先给文字版，后台继续生成截图版  ← 同上
  D. 不需要，Markdown 版本足够
```

若用户选 A → 执行"纯文字 PDF"路径
若用户选 B → 执行"含原型截图 PDF"路径
若用户选 C → 先执行 A，完成后继续执行截图嵌入，生成 illustrated 版本
若用户选 D → 结束

**若 manifest.json 不存在**：跳过询问，仅显示 A/D 两个选项，并提示"如需带截图版，请先运行 /ai-pm prototype"。

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

**三条路径共用的 HTML 构建逻辑**：

```bash
CHROME=~/Library/Caches/ms-playwright/chromium-1212/chrome-mac-arm64/"Google Chrome for Testing.app"/Contents/MacOS/"Google Chrome for Testing"
PRD_DIR="{项目目录}/05-prd"
PROTO_DIR="{项目目录}/06-prototype"
CSS_PATH="templates/prd-styles/default/pdf-style.css"
```

```javascript
// build-pdf-html.js（通用 HTML 构建，withPrototype 参数控制是否嵌图）
const fs = require('fs'), path = require('path');

function buildHtml(prdPath, cssPath, withPrototype = false) {
  let md = fs.readFileSync(prdPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const projectDir = path.resolve(path.dirname(prdPath), '..');

  // 若嵌入原型截图：读 manifest，将 [xxx原型] 替换为 base64 <img>
  if (withPrototype) {
    const manifestPath = path.join(projectDir, '06-prototype/screenshots/manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.sections.forEach(section => {
        const placeholder = '[' + section.label + '原型]';
        const screenshotPath = path.join(projectDir, '06-prototype', section.screenshot);
        if (fs.existsSync(screenshotPath)) {
          const b64 = fs.readFileSync(screenshotPath).toString('base64');
          const imgTag = '<figure class="prototype-figure">'
            + '<img src="data:image/png;base64,' + b64 + '" alt="' + section.label + '" '
            + 'style="max-width:100%;border:1px solid #e0e0e0;border-radius:8px;margin:8pt 0;">'
            + '<figcaption style="text-align:center;font-size:9pt;color:#86868b;margin-top:4pt;">'
            + section.label + '</figcaption></figure>';
          md = md.split(placeholder).join(imgTag);
        }
      });
    }
  }

  // Markdown → HTML（标题/表格/列表/粗体/代码）
  let html = md
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^---$/gm, '<hr>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[^]*?<\/li>\n?)+/g, s => '<ul>' + s + '</ul>');

  html = html.split('\n\n').map(block => {
    if (block.match(/^<(h[1-4]|ul|hr|pre|figure)/)) return block;
    if (block.trim().startsWith('|')) return convertTable(block);
    return '<p>' + block + '</p>';
  }).join('\n');

  function convertTable(block) {
    const rows = block.trim().split('\n').filter(r => !r.match(/^\|[-| :]+\|$/));
    if (!rows.length) return block;
    const cells = r => r.split('|').slice(1, -1).map(c => c.trim());
    const header = cells(rows[0]).map(c => '<th>' + c + '</th>').join('');
    const body = rows.slice(1).map(r =>
      '<tr>' + cells(r).map(c => '<td>' + c + '</td>').join('') + '</tr>'
    ).join('');
    return '<table><thead><tr>' + header + '</tr></thead><tbody>' + body + '</tbody></table>';
  }

  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">'
    + '<style>' + css + '</style></head><body>' + html + '</body></html>';
}

module.exports = { buildHtml };
```

---

#### 路径 A：纯文字版（5 秒）

```bash
node -e "
const { buildHtml } = require('./build-pdf-html.js');
const fs = require('fs');
const html = buildHtml(
  '{项目目录}/05-prd/05-PRD-v1.0.md',
  'templates/prd-styles/default/pdf-style.css',
  false   // ← 不嵌图
);
fs.writeFileSync('{项目目录}/05-prd/_tmp.html', html);
"
"$CHROME" --headless=new --no-sandbox --disable-gpu \
  --print-to-pdf="{项目目录}/05-prd/05-PRD-v1.0.pdf" \
  --print-to-pdf-no-header \
  "file://{项目目录}/05-prd/_tmp.html" 2>/dev/null
rm "{项目目录}/05-prd/_tmp.html"
```

#### 路径 B：含原型截图版（30-40 秒）

```bash
node -e "
const { buildHtml } = require('./build-pdf-html.js');
const fs = require('fs');
const html = buildHtml(
  '{项目目录}/05-prd/05-PRD-v1.0.md',
  'templates/prd-styles/default/pdf-style.css',
  true    // ← 嵌入原型截图
);
fs.writeFileSync('{项目目录}/05-prd/_tmp_illustrated.html', html);
"
"$CHROME" --headless=new --no-sandbox --disable-gpu \
  --print-to-pdf="{项目目录}/05-prd/05-PRD-v1.0-illustrated.pdf" \
  --print-to-pdf-no-header \
  "file://{项目目录}/05-prd/_tmp_illustrated.html" 2>/dev/null
rm "{项目目录}/05-prd/_tmp_illustrated.html"
```

#### 路径 C：先文字版，后截图版

先执行路径 A，告知用户纯文字 PDF 已就绪，再执行路径 B，完成后告知 illustrated 版本路径。

```
✅ 纯文字版已生成：05-prd/05-PRD-v1.0.pdf
⏳ 正在生成带原型截图版，请稍候...
✅ 截图版已生成：05-prd/05-PRD-v1.0-illustrated.pdf
```

---

**产物命名约定**：

| 文件 | 说明 |
|------|------|
| `05-PRD-v1.0.pdf` | 纯文字版（路径 A/C） |
| `05-PRD-v1.0-illustrated.pdf` | 含原型截图版（路径 B/C） |

**注意**：`build-pdf-html.js` 在执行时以内联方式写在 `node -e` 里，无需单独建文件；若 PRD 复杂导致命令过长，可先写到 `/tmp/build-pdf-html.js` 再 `require`。
