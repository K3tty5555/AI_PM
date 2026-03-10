"""
PRD Markdown → DOCX 转换器
支持：标题、段落、表格（含单元格内插图）、列表、粗体、代码、分隔线
"""
import re, json, sys
from pathlib import Path
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

def set_heading_style(para, level):
    run = para.runs[0] if para.runs else para.add_run()
    sizes = {1: 18, 2: 14, 3: 12, 4: 11}
    colors = {1: (0x1d,0x1d,0x1f), 2: (0x2c,0x2c,0x2c), 3: (0x3c,0x3c,0x3c), 4: (0x4c,0x4c,0x4c)}
    run.font.size = Pt(sizes.get(level, 11))
    run.font.bold = True
    r, g, b = colors.get(level, (0,0,0))
    run.font.color.rgb = RGBColor(r, g, b)

def add_inline_formats(para, text):
    """处理粗体 **text**、行内代码 `code`、<br> 换行"""
    # 先按 <br> 切分成多段，段间插入真实换行符
    segments = re.split(r'<br\s*/?>', text, flags=re.IGNORECASE)
    for seg_idx, segment in enumerate(segments):
        if seg_idx > 0:
            para.add_run().add_break()
        parts = re.split(r'(\*\*[^*]+\*\*|`[^`]+`)', segment)
        for part in parts:
            if part.startswith('**') and part.endswith('**'):
                run = para.add_run(part[2:-2])
                run.bold = True
            elif part.startswith('`') and part.endswith('`'):
                run = para.add_run(part[1:-1])
                run.font.name = 'Courier New'
                run.font.size = Pt(10)
            else:
                if part:
                    para.add_run(part)

def shade_cell(cell, hex_color='F5F5F7'):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_color)
    tcPr.append(shd)

def fill_cell(cell, text, is_header=False, screenshot_map=None):
    """
    填充单元格内容。
    若 text 包含 [xxx原型]，在单元格内插图（图在上，描述文字在下）。
    """
    cell.text = ''
    para = cell.paragraphs[0]
    para.paragraph_format.space_after = Pt(2)

    # 检测原型占位符
    img_inserted = False
    if screenshot_map:
        m = re.search(r'\[(.+?)原型\]', text)
        if m:
            label = m.group(1)
            img_path = screenshot_map.get(label)
            if img_path:
                try:
                    run = para.add_run()
                    run.add_picture(img_path, width=Cm(13))
                    para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    img_inserted = True
                    # 图片下方加描述文字（去掉占位符部分）
                    desc = re.sub(r'\[.+?原型\]\s*', '', text).strip()
                    if desc:
                        desc_para = cell.add_paragraph()
                        desc_run = desc_para.add_run(desc)
                        desc_run.font.size = Pt(9)
                        desc_run.font.color.rgb = RGBColor(0x86, 0x86, 0x8b)
                        desc_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                        desc_para.paragraph_format.space_before = Pt(4)
                except Exception as e:
                    print(f'  ⚠️ 图片插入失败 [{label}]: {e}')

    if not img_inserted:
        add_inline_formats(para, text)
        if is_header:
            for run in para.runs:
                run.bold = True
        for run in para.runs:
            run.font.size = Pt(10)

def set_col_width(cell, width_cm):
    """设置单元格固定宽度"""
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    for old in tcPr.findall(qn('w:tcW')):
        tcPr.remove(old)
    tcW = OxmlElement('w:tcW')
    tcW.set(qn('w:w'), str(int(width_cm * 567)))  # 567 twips/cm
    tcW.set(qn('w:type'), 'dxa')
    tcPr.append(tcW)

def apply_col_widths(table, num_cols):
    """A4 正文宽约 16cm；2列时标题列4cm，内容列12cm；多列均分"""
    from docx.shared import Cm as _Cm
    PAGE_W = 16.0
    widths = [4.0, 12.0] if num_cols == 2 else [PAGE_W / num_cols] * num_cols
    # 设置 w:tblGrid（飞书优先读取此处）
    for i, col in enumerate(table.columns):
        if i < len(widths):
            col.width = _Cm(widths[i])
    # 同时设置每格 w:tcW（Office 读取此处）
    for row in table.rows:
        for i, cell in enumerate(row.cells):
            if i < len(widths):
                set_col_width(cell, widths[i])

def add_table(doc, lines, screenshot_map=None):
    """解析 Markdown 表格并插入 DOCX，支持单元格内插图"""
    rows = [l for l in lines if not re.match(r'^\|[-| :]+\|$', l)]
    if len(rows) < 2:
        return
    def cells(row):
        return [c.strip() for c in row.split('|')[1:-1]]

    headers = cells(rows[0])
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = 'Table Grid'

    # 表头行
    hrow = table.rows[0]
    for i, h in enumerate(headers):
        cell = hrow.cells[i]
        fill_cell(cell, h, is_header=True)
        shade_cell(cell, 'F5F5F7')

    # 数据行
    for row_data in rows[1:]:
        row_cells = cells(row_data)
        row = table.add_row()
        for i, val in enumerate(row_cells):
            if i < len(row.cells):
                fill_cell(row.cells[i], val, screenshot_map=screenshot_map)

    # 设置列宽
    apply_col_widths(table, len(headers))
    doc.add_paragraph()

def convert(prd_path, output_path, manifest_path=None):
    prd_path = Path(prd_path)
    project_dir = prd_path.parent.parent

    # 加载截图映射 label → 本地路径
    screenshot_map = {}
    if manifest_path and Path(manifest_path).exists():
        manifest = json.loads(Path(manifest_path).read_text())
        for s in manifest['sections']:
            img_path = project_dir / '06-prototype' / s['screenshot']
            if img_path.exists():
                screenshot_map[s['label']] = str(img_path)
                print(f'  截图映射: [{s["label"]}原型] → {img_path.name}')

    doc = Document()
    style = doc.styles['Normal']
    style.font.name = 'PingFang SC'
    style.font.size = Pt(11)
    style.element.rPr.rFonts.set(qn('w:eastAsia'), 'PingFang SC')

    md = prd_path.read_text(encoding='utf-8')
    lines = md.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i]

        # 标题
        m = re.match(r'^(#{1,4})\s+(.+)$', line)
        if m:
            level = len(m.group(1))
            para = doc.add_heading('', level=min(level, 4))
            para.clear()
            add_inline_formats(para, m.group(2))
            set_heading_style(para, level)
            i += 1
            continue

        # 分隔线
        if re.match(r'^---+$', line.strip()):
            doc.add_paragraph('─' * 40)
            i += 1
            continue

        # 表格
        if line.strip().startswith('|'):
            table_lines = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                table_lines.append(lines[i].strip())
                i += 1
            add_table(doc, table_lines, screenshot_map=screenshot_map)
            continue

        # 无序列表
        if re.match(r'^[-*]\s+', line):
            para = doc.add_paragraph(style='List Bullet')
            para.clear()
            add_inline_formats(para, re.sub(r'^[-*]\s+', '', line))
            i += 1
            continue

        # 有序列表
        if re.match(r'^\d+\.\s+', line):
            para = doc.add_paragraph(style='List Number')
            para.clear()
            add_inline_formats(para, re.sub(r'^\d+\.\s+', '', line))
            i += 1
            continue

        # 空行
        if not line.strip():
            i += 1
            continue

        # 普通段落
        para = doc.add_paragraph()
        add_inline_formats(para, line)
        para.paragraph_format.space_after = Pt(6)
        i += 1

    doc.save(output_path)
    print(f'✅ DOCX 已生成: {output_path}')

if __name__ == '__main__':
    # 用法: python3 md2docx.py <prd.md> <output.docx> [manifest.json]
    if len(sys.argv) < 3:
        print('用法: python3 md2docx.py <prd.md> <output.docx> [manifest.json]')
        sys.exit(1)
    convert(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
