"""
Mermaid 预处理器：将 MD 中的 mermaid 代码块渲染为内联 base64 图片。
输出新的 MD 文件（原文件不变），供 PDF HTML 构建步骤使用。

用法: python3 preprocess_mermaid.py <input.md> <output.md>
"""
import sys, re, base64
from pathlib import Path
import importlib.util

# 复用 md2docx.py 里的 render_mermaid 函数
_spec = importlib.util.spec_from_file_location("md2docx", Path(__file__).parent / "md2docx.py")
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
render_mermaid = _mod.render_mermaid


def process(input_path, output_path):
    md = Path(input_path).read_text(encoding='utf-8')
    count = [0]

    def replace_block(m):
        code = m.group(1)
        print(f'  渲染 Mermaid 流程图 #{count[0] + 1}...')
        png_path = render_mermaid(code)
        count[0] += 1
        if not png_path:
            print(f'  ⚠️ 渲染失败，降级为代码块')
            return f'```\n{code}\n```'
        b64 = base64.b64encode(Path(png_path).read_bytes()).decode()
        Path(png_path).unlink()
        return (
            '<figure style="margin:12pt 0;text-align:center;page-break-inside:avoid;">'
            f'<img src="data:image/png;base64,{b64}" alt="流程图" '
            'style="max-width:100%;border-radius:6px;"/>'
            '</figure>'
        )

    processed = re.sub(r'```mermaid\s*\n([\s\S]*?)```', replace_block, md)
    Path(output_path).write_text(processed, encoding='utf-8')
    print(f'✅ 预处理完成（共 {count[0]} 个流程图）: {output_path}')


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('用法: python3 preprocess_mermaid.py <input.md> <output.md>')
        sys.exit(1)
    process(sys.argv[1], sys.argv[2])
