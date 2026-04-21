#!/usr/bin/env python3
"""
PDF → PNG 页面图像渲染脚本（PyMuPDF / fitz）
用法: python3 pdf_to_images.py <pdf_path> [output_dir]
  output_dir 默认: /tmp/pdf_pages/{pdf_basename_no_ext}/
输出:
  成功:    IMAGES:<output_dir>:<page_count>
  已有缓存: CACHED:<output_dir>:<page_count>
  失败:    ERROR:<原因>  (stderr, exit 1)
"""
import sys
import os
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    print("ERROR:PyMuPDF 未安装，请运行: pip install pymupdf", file=sys.stderr)
    sys.exit(1)

if len(sys.argv) < 2:
    print("ERROR:用法: python3 pdf_to_images.py <pdf_path> [output_dir]", file=sys.stderr)
    sys.exit(1)

pdf_path = Path(sys.argv[1])
if not pdf_path.exists():
    print(f"ERROR:文件不存在: {pdf_path}", file=sys.stderr)
    sys.exit(1)

if len(sys.argv) >= 3:
    out_dir = Path(sys.argv[2])
else:
    out_dir = Path("/tmp/pdf_pages") / pdf_path.stem

# 缓存检查：目录存在且 PNG 数量与页数一致则跳过
try:
    doc = fitz.open(str(pdf_path))
    page_count = len(doc)
except Exception as e:
    print(f"ERROR:无法打开 PDF {pdf_path}: {e}", file=sys.stderr)
    sys.exit(1)

if out_dir.exists():
    existing = list(out_dir.glob("page_*.png"))
    if len(existing) == page_count:
        doc.close()
        print(f"CACHED:{out_dir}:{page_count}")
        sys.exit(0)

out_dir.mkdir(parents=True, exist_ok=True)

mat = fitz.Matrix(2, 2)  # 2× 放大，保证截图/文字清晰可读
for i, page in enumerate(doc):
    pix = page.get_pixmap(matrix=mat)
    pix.save(str(out_dir / f"page_{i+1:03d}.png"))

doc.close()
print(f"IMAGES:{out_dir}:{page_count}")
