#!/usr/bin/env python3
"""
约定包机械抽取脚本（WS0）：把历史 PRD 语料的确定性部分稳定产出为草稿。
用法: python3 build_conventions.py <05-prd目录>
输出: <05-prd>/ai-md/_conventions-draft.md（机械草稿；模型按 references/conventions-template.md
      整理 + 人工挑一遍后，另存为 _conventions.md。本脚本只出事实，不做定稿分级判断——
      分级证据（README 状态列 / 修订日志评审行）已列出，判断留给人）
契约: 成功 BUILT:<path> exit 0；参数/目录错误 ERROR exit 1
"""
import re
import sys
from collections import Counter
from pathlib import Path


def is_current_work(name):
    """当前稿/工作产物不进历史语料——否则本轮草稿的新词会被反向固化成"历史约定"，
    术语审计失去意义。排除：05-PRD-v* 当前稿命名（含其 pdf/docx 导出）、draft、README。"""
    low = name.lower()
    return name == 'README.md' or low.startswith('05-prd-v') or 'draft' in low


def heading_lines(path):
    pats = (r'^#{1,3} ', r'^[一二三四五六七八九十]+、', r'^[0-9]+\.[0-9]+、')
    out = []
    for i, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
        if any(re.match(p, line) for p in pats):
            out.append(f'{i}: {line.strip()}')
    return out


def main():
    if len(sys.argv) < 2:
        print('ERROR:用法: python3 build_conventions.py <05-prd目录>', file=sys.stderr)
        sys.exit(1)
    prd_dir = Path(sys.argv[1])
    if not prd_dir.is_dir():
        print(f'ERROR:目录不存在 {prd_dir}', file=sys.stderr)
        sys.exit(1)

    ai_md = prd_dir / 'ai-md'
    pdfs = sorted(p for p in prd_dir.glob('*.pdf') if not is_current_work(p.name))
    natives = sorted(p for p in prd_dir.glob('*.md') if not is_current_work(p.name))
    extracts = sorted(
        p for p in ai_md.glob('*.md')
        if not p.name.startswith('_') and not is_current_work(p.name)
    ) if ai_md.is_dir() else []
    corpus = natives + extracts

    L = ['# 约定包机械草稿（_conventions-draft.md）', '',
         '> 本文件由 build_conventions.py 机械产出（只有事实、没有判断）。',
         '> 模型按 `references/conventions-template.md` 整理 + 人工挑一遍后，另存为 `_conventions.md`。', '']

    # 1. 来源清单 + 定稿信号
    L += ['## 1. 来源清单（定稿分级证据，判断留给人）', '',
          '| 文件 | 形态 | 修订日志「评审通过」命中 |', '|---|---|---|']
    for p in pdfs:
        has_native = p.with_suffix('.md').exists()
        L.append(f'| `{p.name}` | PDF{"（有同名原生 md，以 md 为权威）" if has_native else "（需抽取，ai-md/）"} | — |')
    for p in corpus:
        n = len(re.findall(r'评审通过', p.read_text(encoding='utf-8')))
        kind = '原生 MD' if p in natives else '机器抽取件'
        L.append(f'| `{p.relative_to(prd_dir)}` | {kind} | {n} |')
    readme = prd_dir / 'README.md'
    if readme.exists():
        rows = [l for l in readme.read_text(encoding='utf-8').splitlines() if re.match(r'^\|\s*~?~?V', l)]
        if rows:
            L += ['', '**README 版本表状态行（定稿信号源）**：', '```'] + rows + ['```']
    L.append('')

    # 2. 章节骨架
    L.append('## 2. 章节骨架（逐件）')
    for p in corpus:
        L += ['', f'### {p.name}', '```'] + (heading_lines(p) or ['（未匹配到标题模式）']) + ['```']
    L.append('')

    # 3/4. 术语频次
    text = '\n'.join(p.read_text(encoding='utf-8') for p in corpus)
    bold = Counter(m.strip() for m in re.findall(r'\*\*([^*]{2,20})\*\*', text))
    quoted = Counter(m for m in re.findall(r'「([^」]{2,12})」', text))
    L += ['## 3. 加粗词频次 TOP30（候选术语源之一）', '```']
    L += [f'{n:>4}  {w}' for w, n in bold.most_common(30)] or ['（无）']
    L += ['```', '', '## 4. 「」内动作名频次 TOP25（UI 真名候选）', '```']
    L += [f'{n:>4}  {w}' for w, n in quoted.most_common(25)] or ['（无）']
    L += ['```', '',
          '## 5. 待人工核（stub）', '',
          '- [ ] 机器抽取件的表格丢失 / 乱码段',
          '- [ ] 同义/冲突术语（频次表里近义词并存的）',
          '- [ ] 定稿分级：按 §1 证据逐件定 A 级 / 草稿级 / 已归档', '']

    ai_md.mkdir(parents=True, exist_ok=True)
    out = ai_md / '_conventions-draft.md'
    out.write_text('\n'.join(L), encoding='utf-8')
    print(f'BUILT:{out}')


if __name__ == '__main__':
    main()
