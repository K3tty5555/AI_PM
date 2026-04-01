// build-pdf-html.js — PRD Markdown → HTML，withPrototype 参数控制是否嵌入截图
const fs = require('fs'), path = require('path');

function buildHtml(prdPath, cssPath, withPrototype = false) {
  let md = fs.readFileSync(prdPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const projectDir = path.resolve(path.dirname(prdPath), '..');

  // 嵌入原型截图：将 [xxx原型] 替换为 base64 <img>
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
            + section.label + ' 原型截图</figcaption></figure>';
          md = md.split(placeholder).join(imgTag);
        }
      });
    }
  }

  // Markdown → HTML（标题/表格/列表/粗体/代码/mermaid代码块）
  let lines = md.split('\n');
  let htmlLines = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // mermaid 代码块：降级显示为代码框（![alt](path) 图片引用已在步骤6生成，由上方正则处理）
    if (line.trim().startsWith('```mermaid')) {
      let block = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        block.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      // 降级：mermaid 未预处理时显示为代码框
      htmlLines.push('<pre class="mermaid-fallback">' + block.join('\n').replace(/</g,'&lt;') + '</pre>');
      continue;
    }
    // 其他代码块
    if (line.trim().startsWith('```')) {
      let block = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        block.push(lines[i]);
        i++;
      }
      i++;
      htmlLines.push('<pre><code>' + block.join('\n').replace(/</g,'&lt;') + '</code></pre>');
      continue;
    }
    htmlLines.push(line);
    i++;
  }
  let html = htmlLines.join('\n');

  // 嵌入 Markdown 图片：![alt](path) → <figure><img base64><figcaption></figcaption></figure>
  // 注意：此替换必须在标题/粗体等行内 Markdown 转换之前执行
  const prdDir = path.dirname(path.resolve(prdPath));
  const extMimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
  const escHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, imgPath) => {
    try {
      const absPath = path.isAbsolute(imgPath) ? imgPath : path.resolve(prdDir, imgPath);
      const ext = path.extname(absPath).toLowerCase();
      if (!extMimeMap[ext]) return match;
      if (!fs.existsSync(absPath)) return match;
      const b64 = fs.readFileSync(absPath).toString('base64');
      const safeAlt = escHtml(alt);
      return '<figure>'
        + '<img src="data:' + extMimeMap[ext] + ';base64,' + b64 + '" alt="' + safeAlt + '" '
        + 'style="max-width:100%;display:block;margin:0 auto;">'
        + '<figcaption style="text-align:center;color:#666;font-size:0.9em;margin-top:4px;">' + safeAlt + '</figcaption>'
        + '</figure>';
    } catch (e) {
      return match;
    }
  });

  // 标题
  html = html
    .replace(/^#### (.+)$/gm, (_, t) => '<h4>' + t + '</h4>')
    .replace(/^### (.+)$/gm,  (_, t) => '<h3>' + t + '</h3>')
    .replace(/^## (.+)$/gm,   (_, t) => '<h2>' + t + '</h2>')
    .replace(/^# (.+)$/gm,    (_, t) => '<h1>' + t + '</h1>');

  // 行内格式
  html = html
    .replace(/\*\*(.+?)\*\*/g, (_, t) => '<strong>' + t + '</strong>')
    .replace(/`(.+?)`/g,        (_, t) => '<code>' + t + '</code>');

  // 分隔线
  html = html.replace(/^---$/gm, '<hr>');

  // 列表项
  html = html.replace(/^- (.+)$/gm, (_, t) => '<li>' + t + '</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, s => '<ul>' + s + '</ul>');

  // 段落 & 表格
  html = html.split('\n\n').map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    if (trimmed.match(/^<(h[1-4]|ul|hr|pre|figure|table)/)) return block;
    if (trimmed.startsWith('|')) return convertTable(trimmed);
    return '<p>' + block + '</p>';
  }).join('\n');

  function convertTable(block) {
    const rows = block.split('\n').filter(r => !/^\|[-| :]+\|$/.test(r.trim()) && r.trim());
    if (!rows.length) return block;
    const cells = r => r.split('|').slice(1, -1).map(c => c.trim());
    const header = cells(rows[0]).map(c => '<th>' + c + '</th>').join('');
    const body = rows.slice(1).map(r =>
      '<tr>' + cells(r).map(c => '<td>' + c + '</td>').join('') + '</tr>'
    ).join('');
    return '<table><thead><tr>' + header + '</tr></thead><tbody>' + body + '</tbody></table>';
  }

  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">'
    + '<style>' + css + '.mermaid-fallback{background:#f5f5f7;border-radius:8px;padding:12pt;font-size:9pt;color:#555;white-space:pre-wrap;margin:8pt 0;}</style>'
    + '</head><body>' + html + '</body></html>';
}

module.exports = { buildHtml };
