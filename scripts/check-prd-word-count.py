#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PRD 字数三档机械检查（口径唯一实现，单源=本文件头注释；判断卡 §7.1 只留指针）。

口径（剔噪版，2026-07-15 用户拍板）——预处理按序：
  ① 删 HTML 注释 <!--…-->（doctype 行 / 云增强指令 / 预算行不算字）
  ② 删已闭合围栏代码块（行级状态机，backtick/tilde fence；mermaid 等价于图，不算字；
     未闭合 fence = 整篇无有效档位 → BAND invalid_markdown + exit 4，fail-closed，
     不得剥到 EOF 后继续判档——防"未闭合 fence 把后半文伪装成低字数"绕硬线）
  ③ 图片语法保留 alt 文字、删 ![ 与 ](路径)
  ④ 删表格分隔行（仅由 | - : 空白 组成且含 - 的行）
  计数 = 剩余文本非空白字符数。口径铁定：表格竖线、粗体/链接等剩余源码标记、<br>、
  <红>/<灰> 等云增强内联标记均计入；改口径只改本脚本 + selftest。

三档（边界含闭性钉死）：<=10000 达标 ok；10001~15000 说理区 justify（须文件头
  <!-- over-budget-reason: … --> 机读注释）；>15000 超硬线 hard_stop。

doctype：正则与 scripts/check-prd-skeleton.sh detect() 逐字符一致
  （<!-- doctype: (full|decision_review) -->，单空格）；两文件互为交叉引用，改一处必同步另一处。
  文件头无标记时不猜 full（宁漏勿误）→ BAND unknown_doctype + exit 3，
  由 driver 交 pm-agent 3bis 判型后用 --doctype 显式回传重跑；档位永远由本脚本唯一计算。

stdout 机器行（主通道，消费方读 BAND 不读退出码语气）：
  CHAR_COUNT: n | BAND: x | DOCTYPE: y | DOCTYPE_SOURCE: header/override/unknown | THRESHOLDS: 10000/15000
  OVER_BUDGET_REASON: present/missing
退出码（副通道）：0 达标 / 1 说理区 / 2 超硬线 / 3 跳过或未测（decision_review、unknown_doctype）
  / 4 错误（IO、UnicodeDecodeError、非 .md、未闭合 fence、参数错误）。手工解析参数，避免 argparse 撞码 2。

用法：python3 scripts/check-prd-word-count.py "<PRD绝对路径>" [--doctype full|decision_review]
      python3 scripts/check-prd-word-count.py --selftest
"""
import re
import sys

THRESHOLD_OK = 10000
THRESHOLD_JUSTIFY = 15000

DOCTYPE_RE = re.compile(r'<!-- doctype: (full|decision_review) -->')  # 与 check-prd-skeleton.sh 逐字符一致
REASON_RE = re.compile(r'<!--\s*over-budget-reason:\s*(\S[^>]*?)\s*-->')
HEADER_LINE_RE = re.compile(r'^\s*(<!--.*?-->\s*)+$')  # 单行 HTML 注释行（文件头区判定用）
COMMENT_RE = re.compile(r'<!--.*?-->', re.DOTALL)
IMAGE_RE = re.compile(r'!\[([^\]]*)\]\([^)]*\)')
SEPARATOR_RE = re.compile(r'^[\s|:\-]+$')
FENCE_RE = re.compile(r'^\s{0,3}(`{3,}|~{3,})')

BAND_EXIT = {
    'ok': 0, 'justify': 1, 'hard_stop': 2,
    'skipped_decision_review': 3, 'unknown_doctype': 3,
    'invalid_markdown': 4,
}


FENCE_CLOSE_RE = re.compile(r'^\s{0,3}(`{3,}|~{3,})\s*$')


def header_zone(raw):
    """文件头区 = 顶部连续的空行 / 单行 HTML 注释行；over-budget-reason 只认这里（放正文/文末不算）。"""
    lines = []
    for line in raw.split('\n'):
        if not line.strip() or HEADER_LINE_RE.match(line):
            lines.append(line)
            continue
        break
    return '\n'.join(lines)


def strip_fences(text):
    """删已闭合围栏代码块；未闭合返回 None（fail-closed）。
    CommonMark 闭合规则：闭合 fence 须同字符、长度 >= 开启 fence、且行内只有 fence——
    否则算围栏内容（防"4 反引号开、3 反引号假闭合"把后半文伪装成代码剥掉绕硬线）。"""
    out = []
    in_fence, fence_char, fence_len = False, None, 0
    for line in text.split('\n'):
        if not in_fence:
            m = FENCE_RE.match(line)
            if m:
                in_fence, fence_char, fence_len = True, m.group(1)[0], len(m.group(1))
                continue
            out.append(line)
        else:
            m = FENCE_CLOSE_RE.match(line)
            if m and m.group(1)[0] == fence_char and len(m.group(1)) >= fence_len:
                in_fence, fence_char, fence_len = False, None, 0
                continue
            # 围栏内其余行（含更短 / 带尾巴 / 异种 fence 样式行）都是内容
    if in_fence:
        return None
    return '\n'.join(out)


def char_count(raw):
    """按剔噪口径计数；未闭合 fence 返回 None。"""
    text = COMMENT_RE.sub('', raw)
    text = strip_fences(text)
    if text is None:
        return None
    text = IMAGE_RE.sub(r'\1', text)
    lines = [l for l in text.split('\n') if not (SEPARATOR_RE.match(l) and '-' in l and '|' in l)]
    return len(re.sub(r'\s', '', '\n'.join(lines)))


def band_of(count):
    if count <= THRESHOLD_OK:
        return 'ok'
    if count <= THRESHOLD_JUSTIFY:
        return 'justify'
    return 'hard_stop'


def analyze(raw, doctype_override=None):
    """返回 (band, count, doctype, source, reason_present)。"""
    m = DOCTYPE_RE.search(raw)
    if m:
        doctype, source = m.group(1), 'header'
    elif doctype_override:
        doctype, source = doctype_override, 'override'
    else:
        doctype, source = 'unknown', 'unknown'
    count = char_count(raw)
    reason = bool(REASON_RE.search(header_zone(raw)))  # 只认文件头区，全文搜索可被文末注释绕过
    if count is None:
        return 'invalid_markdown', -1, doctype, source, reason
    if doctype == 'decision_review':
        return 'skipped_decision_review', count, doctype, source, reason
    if doctype == 'unknown':
        return 'unknown_doctype', count, doctype, source, reason
    return band_of(count), count, doctype, source, reason


def machine_lines(band, count, doctype, source, reason):
    return (
        'CHAR_COUNT: %d | BAND: %s | DOCTYPE: %s | DOCTYPE_SOURCE: %s | THRESHOLDS: %d/%d'
        % (count, band, doctype, source, THRESHOLD_OK, THRESHOLD_JUSTIFY),
        'OVER_BUDGET_REASON: %s' % ('present' if reason else 'missing'),
    )


def run_file(path, doctype_override=None):
    if not path.endswith('.md'):
        print('ERROR: not_a_markdown_file | %s' % path)
        return 4
    try:
        with open(path, encoding='utf-8') as f:
            raw = f.read()
    except (OSError, UnicodeDecodeError) as e:
        print('ERROR: %s | %s' % (type(e).__name__, path))
        return 4
    band, count, doctype, source, reason = analyze(raw, doctype_override)
    for line in machine_lines(band, count, doctype, source, reason):
        print(line)
    if band == 'justify' and not reason:
        print('HINT: 说理区须在文件头加 <!-- over-budget-reason: 一句话超因 -->（判断卡 §7.1）')
    return BAND_EXIT[band]


def selftest():
    fails = []
    n_checks = [0]

    def check(name, got, want):
        n_checks[0] += 1
        if got != want:
            fails.append('%s: got %r want %r' % (name, got, want))

    hdr = '<!-- doctype: full -->\n'
    # ① 阈值样本：期望值双硬编码（不从阈值常量派生，防阈值漂移 selftest 恒绿）
    for n, want in ((10000, 'ok'), (10001, 'justify'), (15000, 'justify'), (15001, 'hard_stop')):
        band, count, _, _, _ = analyze(hdr + '字' * n)
        check('threshold_%d_band' % n, band, want)
        check('threshold_%d_count' % n, count, n)
    # ② 口径锁定样本：断言精确计数值（含 mermaid/注释/分隔行/图片/粗体/链接/<br>/表格竖线）
    sample = (
        '<!-- doctype: full -->\n'
        '# 标题一\n\n'
        '正文 **加粗** [链接](https://example.com) 文字<br>\n'
        '![图片说明](path/to/img.png)\n'
        '```mermaid\n graph TD; A-->B\n```\n'
        '~~~\ncode here\n~~~\n'
        '| 列A | 列B |\n'
        '|---|---|\n'
        '| 值1 | 值2 |\n'
    )
    band, count, doctype, source, _ = analyze(sample)
    check('sample_count', count, 61)
    check('sample_band', band, 'ok')
    check('sample_source', source, 'header')
    # ③ decision_review 跳过 / 缺 doctype / --doctype 回传重跑
    band, _, _, _, _ = analyze('<!-- doctype: decision_review -->\n正文')
    check('dr_skip', band, 'skipped_decision_review')
    band, _, doctype, source, _ = analyze('无标记正文')
    check('missing_doctype_band', band, 'unknown_doctype')
    check('missing_doctype_source', source, 'unknown')
    band, _, doctype, source, _ = analyze('无标记正文', doctype_override='full')
    check('override_band', band, 'ok')
    check('override_source', source, 'override')
    # ④ 未闭合 fence（backtick / tilde）fail-closed
    for fence in ('```', '~~~'):
        band, count, _, _, _ = analyze(hdr + fence + '\n这段不该被剥掉后当低字数\n')
        check('unclosed_%s_band' % fence[0], band, 'invalid_markdown')
        check('unclosed_%s_count' % fence[0], count, -1)
    # ④bis fence 长度规则（CommonMark）：4 开 3 闭 = 假闭合，整篇 invalid；3 开 4 闭 = 合法闭合
    band, count, _, _, _ = analyze(hdr + '````\n' + '字' * 20000 + '\n```\n尾巴')
    check('fence_4open_3close_band', band, 'invalid_markdown')
    check('fence_4open_3close_count', count, -1)
    band, count, _, _, _ = analyze(hdr + '```\ncode\n````\n正文四字')
    check('fence_3open_4close_band', band, 'ok')
    check('fence_3open_4close_count', count, 4)
    # ⑤ over-budget-reason 检测（只认文件头区）+ 机器行格式断言
    _, _, _, _, reason = analyze(hdr + '<!-- over-budget-reason: 多场景合一首版 -->\n' + '字' * 12000)
    check('reason_present', reason, True)
    _, _, _, _, reason = analyze(hdr + '字' * 12000 + '\n<!-- over-budget-reason: 藏在文末不算 -->')
    check('reason_at_eof_missing', reason, False)
    l1, l2 = machine_lines('justify', 12000, 'full', 'header', True)
    fmt = re.compile(r'^CHAR_COUNT: -?\d+ \| BAND: \S+ \| DOCTYPE: \S+ \| DOCTYPE_SOURCE: \S+ \| THRESHOLDS: 10000/15000$')
    check('machine_line_format', bool(fmt.match(l1)), True)
    check('reason_line', l2, 'OVER_BUDGET_REASON: present')
    # ⑥ 退出码映射
    check('exit_map', [BAND_EXIT[b] for b in ('ok', 'justify', 'hard_stop', 'skipped_decision_review', 'unknown_doctype', 'invalid_markdown')], [0, 1, 2, 3, 3, 4])

    if fails:
        print('SELFTEST: FAIL (%d/%d)' % (len(fails), n_checks[0]))
        for f in fails:
            print('  - ' + f)
        return 1
    print('SELFTEST: PASS (%d assertions)' % n_checks[0])
    return 0


def main(argv):
    args = [a for a in argv[1:]]
    if not args:
        print('ERROR: usage | check-prd-word-count.py "<PRD.md>" [--doctype full|decision_review] | --selftest')
        return 4
    if args[0] == '--selftest':
        return selftest()
    path, override = None, None
    i = 0
    while i < len(args):
        if args[i] == '--doctype':
            if i + 1 >= len(args) or args[i + 1] not in ('full', 'decision_review'):
                print('ERROR: bad_doctype_arg | --doctype full|decision_review')
                return 4
            override = args[i + 1]
            i += 2
        elif args[i].startswith('--'):
            print('ERROR: unknown_arg | %s' % args[i])
            return 4
        else:
            if path is not None:
                print('ERROR: multiple_paths')
                return 4
            path = args[i]
            i += 1
    if path is None:
        print('ERROR: missing_path')
        return 4
    return run_file(path, override)


if __name__ == '__main__':
    sys.exit(main(sys.argv))
