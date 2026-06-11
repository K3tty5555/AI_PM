#!/usr/bin/env python3
"""
PDF → Markdown 文本抽取脚本（WS0 地基：历史 PRD 变 AI 可读）
用法: python3 pdf_to_md.py <pdf_path> [输出目录]
输出: 默认 <pdf所在目录>/ai-md/<同名>.md
输出契约（与 phase-5「渲染/转换失败不中断主流程」对齐）:
  - 成功: CONVERTED:<md_path>, exit 0
  - 跳过（已有原生 md / 单件转换失败，调用方记录后继续）: SKIP:<文件名>:<原因>, exit 0
  - 阻断（参数错误 / 缺 pypdf 等环境依赖——明着阻断不静默跳过）: ERROR:<原因> (stderr), exit 1
抽取件顶部自动加「机器抽取 · 非权威」标注
"""
import sys
import unicodedata
from pathlib import Path

# CJK 部首补充区的简体部首没有 NFKC 兼容分解（⻅⻚⻓⻬⻛⻆⻜等），需手工映射
_SIMPLIFIED_RADICALS = {
    '⻅': '见', '⻆': '角', '⻉': '贝', '⻋': '车', '⻓': '长', '⻔': '门',
    '⻙': '韦', '⻚': '页', '⻛': '风', '⻜': '飞', '⻢': '马', '⻥': '鱼',
    '⻦': '鸟', '⻫': '齐', '⻬': '齐', '⻭': '齿', '⻮': '齿', '⻯': '龙',
    '⻰': '龙', '⻱': '龟', '⻲': '龟', '⻳': '龟', '⻧': '卤', '⻨': '麦',
    '⻩': '黄', '⻪': '黾', '⻘': '青', '⻝': '食', '⻐': '钅', '⻈': '讠',
}


def normalize_radicals(text):
    """部首区（U+2E80–U+2FDF）→ 统一汉字，否则 grep 全失配；不动其他字符（保留全角标点）。
    康熙部首区走 NFKC；CJK 部首补充区的简体部首无 NFKC 分解，走手工映射表。"""
    out = []
    for c in text:
        if 0x2E80 <= ord(c) <= 0x2FDF:
            n = unicodedata.normalize('NFKC', c)
            out.append(_SIMPLIFIED_RADICALS.get(c, n) if n == c else n)
        else:
            out.append(c)
    return ''.join(out)


def main():
    try:
        from pypdf import PdfReader
    except ImportError:
        print("ERROR:pypdf 未安装，请运行: pip install pypdf", file=sys.stderr)
        sys.exit(1)

    if len(sys.argv) < 2:
        print("ERROR:用法: python3 pdf_to_md.py <pdf_path> [输出目录]", file=sys.stderr)
        sys.exit(1)

    pdf_path = Path(sys.argv[1])
    if not pdf_path.exists():
        print(f"ERROR:文件不存在 {pdf_path}", file=sys.stderr)
        sys.exit(1)

    native_md = pdf_path.with_suffix('.md')
    if native_md.exists():
        print(f"SKIP:{pdf_path.name}:native-md-exists（以原生 md 为权威）")
        sys.exit(0)

    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else pdf_path.parent / 'ai-md'
    out_dir.mkdir(parents=True, exist_ok=True)
    md_path = out_dir / (pdf_path.stem + '.md')

    try:
        reader = PdfReader(str(pdf_path))
    except Exception as e:
        print(f"SKIP:{pdf_path.name}:无法读取（{e}）——单件失败不中断批量，调用方记录后继续")
        sys.exit(0)

    lines = [
        f"> ⚠️ 机器抽取自 PDF（{pdf_path.name}）· 版式/表格可能丢失 · 非权威，权威以 PDF / 正式 PRD 为准",
        "",
    ]
    for i, page in enumerate(reader.pages, 1):
        text = normalize_radicals((page.extract_text() or '').strip())
        lines.append(f"<!-- 第 {i} 页 -->")
        lines.append(text)
        lines.append("")

    md_path.write_text('\n'.join(lines), encoding='utf-8')
    print(f"CONVERTED:{md_path}")


if __name__ == '__main__':
    main()
