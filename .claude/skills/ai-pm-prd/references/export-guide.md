# PRD 导出实现指南

## 环境变量（三条路径共用）

```bash
CHROME=~/Library/Caches/ms-playwright/chromium-1212/chrome-mac-arm64/"Google Chrome for Testing.app"/Contents/MacOS/"Google Chrome for Testing"
PRD_DIR="{项目目录}/05-prd"
PROTO_DIR="{项目目录}/06-prototype"
CSS_PATH="templates/prd-styles/default/pdf-style.css"
SKILL_DIR=".claude/skills/ai-pm-prd"
```

## build-pdf-html.js（HTML 构建核心）

```javascript
const fs = require('fs'), path = require('path');

function buildHtml(prdPath, cssPath, withPrototype = false) {
  let md = fs.readFileSync(prdPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const projectDir = path.resolve(path.dirname(prdPath), '..');

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

## 路径 A：纯文字 PDF（~5 秒）

> 不含原型截图，Mermaid 保留代码块原样。

```bash
node -e "
const { buildHtml } = require('./build-pdf-html.js');
const fs = require('fs');
const html = buildHtml('{项目目录}/05-prd/05-PRD-v1.0.md', 'templates/prd-styles/default/pdf-style.css', false);
fs.writeFileSync('{项目目录}/05-prd/_tmp.html', html);
"
"$CHROME" --headless=new --no-sandbox --disable-gpu \
  --print-to-pdf="{项目目录}/05-prd/05-PRD-v1.0.pdf" \
  --print-to-pdf-no-header \
  "file://{项目目录}/05-prd/_tmp.html" 2>/dev/null
rm "{项目目录}/05-prd/_tmp.html"
```

---

## 路径 B：含原型截图 PDF（~30-40 秒）

> `ai_illustration_mode=true` 时用 `_export_tmp.md`，否则用原始 PRD。

```bash
if [ "$ai_illustration_mode" = "true" ]; then
  INPUT="{项目目录}/05-prd/_export_tmp.md"
else
  INPUT="{项目目录}/05-prd/05-PRD-v1.0.md"
fi

node -e "
const { buildHtml } = require('./build-pdf-html.js');
const fs = require('fs');
const html = buildHtml('$INPUT', 'templates/prd-styles/default/pdf-style.css', true);
fs.writeFileSync('{项目目录}/05-prd/_tmp_illustrated.html', html);
"
"$CHROME" --headless=new --no-sandbox --disable-gpu \
  --print-to-pdf="{项目目录}/05-prd/05-PRD-v1.0-illustrated.pdf" \
  --print-to-pdf-no-header \
  "file://{项目目录}/05-prd/_tmp_illustrated.html" 2>/dev/null
rm "{项目目录}/05-prd/_tmp_illustrated.html"
```

---

## 路径 C：DOCX 含截图（~20 秒）

```bash
python3 "$SKILL_DIR/md2docx.py" \
  "{项目目录}/05-prd/05-PRD-v1.0.md" \
  "{项目目录}/05-prd/05-PRD-v1.0.docx" \
  "{项目目录}/06-prototype/screenshots/manifest.json"
```

**依赖**：`python-docx`（首次使用自动安装）。  
**飞书导入**：飞书「新建文档」→「导入」→ 选择 `.docx`。

---

## 路径 E：先文字版，后截图版

先执行路径 A 告知就绪，再执行路径 B，完成后提示截图版路径。

```
✅ 纯文字版已生成：05-prd/05-PRD-v1.0.pdf
⏳ 正在生成带原型截图版，请稍候...
✅ 截图版已生成：05-prd/05-PRD-v1.0-illustrated.pdf
```

---

## 产物命名约定

| 文件 | 说明 |
|------|------|
| `05-PRD-v1.0.md` | 原始 Markdown（始终保留） |
| `05-PRD-v1.0.pdf` | 纯文字 PDF（路径 A/E） |
| `05-PRD-v1.0.docx` | 含截图 DOCX，用于飞书导入（路径 C） |
| `05-PRD-v1.0-illustrated.pdf` | 含截图 PDF，自包含（路径 B/E） |
