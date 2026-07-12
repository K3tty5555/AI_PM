"""prd_publish / prd_pull / prd_rerender_survey 共享常量与助手（review 修复批 · 2026-07-12）。

单一事实源：云增强标记/图片/callout 的正则只此一份——判断卡 §十 加新标记语法时改这里，
三个消费脚本自动同步（此前 publish/pull 各写一份已出现分叉：IMG_RE 捕获组、CALLOUT 尾空白）。
"""
from __future__ import annotations

import hashlib
import re

IMG_RE = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")
MARKER_RE = re.compile(r"</?红>|</?灰>|==([^=\n]+)==")
CALLOUT_RE = re.compile(r"^> \[!(?:TIP|WARNING|NOTE)\]\s*", re.M)
FOLD_RE = re.compile(r"<!--\s*/?fold\s*-->|<!--\s*columns[^>]*-->")
LINK_RE = re.compile(r"\[([^\]]+)\]\([^)]+\)")
TABLE_SEP_RE = re.compile(r"^\s*\|?[\s:-]*-[\s:|-]*\|?\s*$")
CODE_FENCE_RE = re.compile(r"^```\w*\s*$", re.M)


def find_token_by_title(title: str, search_docs_fn) -> str | None:
    """按标题精确匹配找 doc token（结果嵌在 data 下——探针坑已记 memory）。"""
    try:
        hits = ((search_docs_fn(title, count=10) or {}).get("data") or {}).get("docs_entities") or []
    except Exception:
        return None
    for h in hits:
        if h.get("title") == title:
            return h.get("docs_token")
    return None


def code_fence_literals(md: str, literals: tuple[str, ...]) -> set[str]:
    """源 md 代码围栏里出现过哪些字面量（这些不算云端渲染残留——讲语法的示例文档合法含有）。"""
    found = set()
    in_code = False
    for ln in md.split("\n"):
        if ln.strip().startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            for lit in literals:
                if lit in ln:
                    found.add(lit)
    return found


def content_fingerprint(text: str) -> str:
    """云文档正文指纹（SHA-256，二轮复验 2.3）。只归一换行与行尾空白——
    不做 \\s+ 全删（"ab" 与 "a b" 是两份正文，删空白会把真人改洗没）。"""
    lines = [ln.rstrip() for ln in text.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    return hashlib.sha256("\n".join(lines).strip("\n").encode("utf-8")).hexdigest()


# 读回判"文档已不存在"的白名单：宁窄勿宽——只认零歧义信号，猜错误码比留空危险。
# 实测到本部署真实 not-found 码后再往 codes 里补（补时注明实测日期）。
_NOT_FOUND_CODES: set = set()
# 文案兜底必须**带明确对象**（三轮复验 §四：裸 `not found` 会把 application/app/
# credential/route not found 等鉴权/路由错误判成"文档已删除"）。\bfile\b 词边界防 profile 误中。
_NOT_FOUND_MSG_RE = re.compile(
    r"\b(?:document|docx|file)\b[^.;，。]*?\b(?:not\s+found|(?:does\s+not|doesn't)\s+exist|deleted)\b"
    r"|文档不存在|文件不存在|文档已(?:被)?删除|文件已(?:被)?删除", re.I)


def delete_verdict(delete_resp: dict, readback: dict) -> tuple[str, str]:
    """删除结果判定（纯函数，fail-closed，二轮复验 §三）。返回 (verdict, reason)：
    - "fail"    删除响应 code!=0，或读回仍能读到块；
    - "ok"      删除响应 code=0 且读回命中明确 not-found（错误码白名单/文案）；
    - "unknown" 其余一切（权限/限流/网络错误、读回 0 块=空文档≠已删除）——不得当成功。"""
    dcode = (delete_resp or {}).get("code")
    if dcode != 0:
        return "fail", f"删除响应 code={dcode} msg={(delete_resp or {}).get('msg')}"
    err = (readback or {}).get("error")
    if err:
        ecode = (readback or {}).get("error_code")
        if ecode in _NOT_FOUND_CODES or _NOT_FOUND_MSG_RE.search(str(err)):
            return "ok", f"读回明确 not-found（code={ecode}）"
        return "unknown", f"读回报错但非 not-found（code={ecode} · 权限/限流/网络均可能）：{str(err)[:80]}"
    total = (readback or {}).get("total")
    if total:
        return "fail", f"读回仍可读到 {total} 块，删除未生效"
    return "unknown", "读回 0 块=空文档，不等于已删除（软删进回收站后读回应报错而非 0 块）"


def count_headings_for_push(md: str) -> int:
    """与 push 行为一致的源侧标题计数：1-6 级、跳过代码围栏内的 #、剥掉将被文档名承担的首行 H1。"""
    lines = md.split("\n")
    n = 0
    in_code = False
    for i, ln in enumerate(lines):
        if ln.strip().startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        if re.match(r"^#{1,6} ", ln):
            if i == 0 and ln.startswith("# "):
                continue  # push 前被剥、由文档名承担
            n += 1
    return n


RESIDUE_LITERALS = ("<红>", "</红>", "<灰>", "</灰>", "[!TIP]", "[!WARNING]")


def find_residues(md_src: str, raw: str, lits: tuple[str, ...] = RESIDUE_LITERALS) -> list[str]:
    """云端正文里的增强标记字面残留（渲染未生效）。源代码围栏里本来就有的字面量豁免。"""
    legit = code_fence_literals(md_src, lits)
    return [m for m in lits if m in raw and m not in legit]


def _selftest() -> int:
    # content_fingerprint：换行/行尾空白归一、但不吞正文空白
    assert content_fingerprint("a \r\nb\r\n") == content_fingerprint("a\nb")
    assert content_fingerprint("ab") != content_fingerprint("a b"), "空白全删会把真人改洗没"
    assert content_fingerprint("abc") != content_fingerprint("abd")
    # delete_verdict 四象限（Codex 二轮复验 3.3 矩阵）
    assert delete_verdict({"code": 0}, {"total": None, "error": "document not found", "error_code": 99})[0] == "ok"
    assert delete_verdict({"code": 0}, {"total": None, "error": "permission denied", "error_code": 403})[0] == "unknown"
    assert delete_verdict({"code": 0}, {"total": 12, "by_type": {}})[0] == "fail"
    assert delete_verdict({"code": 1061002, "msg": "x"}, {})[0] == "fail"
    assert delete_verdict({"code": 0}, {"total": 0, "by_type": {}})[0] == "unknown", "0 块=空文档≠已删除"
    # not-found 文案必须带对象（三轮复验 §4.4 四负例固定——防正则再次放宽）
    for bad_msg in ("application not found", "app not found", "credential deleted", "route not found"):
        assert delete_verdict({"code": 0}, {"total": None, "error": bad_msg, "error_code": 1})[0] == "unknown", bad_msg
    for ok_msg in ("document not found", "docx does not exist", "file has been deleted",
                   "文档不存在", "文件已删除"):
        assert delete_verdict({"code": 0}, {"total": None, "error": ok_msg, "error_code": 1})[0] == "ok", ok_msg
    assert delete_verdict({"code": 0}, {"total": None, "error": "profile not found", "error_code": 1})[0] == "unknown"
    # find_residues：真残留抓到、围栏示例豁免
    assert find_residues("正文", "云端<红>x</红>") == ["<红>", "</红>"]
    assert find_residues("```\n<红>示例\n```", "云端<红>示例") == []
    # get_doc_raw_content fail-closed 三态（本机有插件才测；fresh clone 跳过）
    try:
        import sys as _sys
        from pathlib import Path as _P
        _sys.path.insert(0, str(_P(__file__).resolve().parent.parent
                                / ".claude" / "skills" / "xfchat-wiki" / "scripts"))
        import feishu_doc as _fd
        _orig = _fd.get_doc_raw_text
        try:
            _fd.get_doc_raw_text = lambda d, lang=0: {"code": 0, "data": {"content": "正文"}}
            assert _fd.get_doc_raw_content("x") == "正文"
            for bad in ({"code": 99992402, "msg": "boom"}, {"code": 0, "data": {}},
                        {"code": 0, "data": "not-an-object"}, None):
                _fd.get_doc_raw_text = lambda d, lang=0, _b=bad: _b
                try:
                    _fd.get_doc_raw_content("x")
                    raise AssertionError(f"应抛 DocApiError: {bad}")
                except _fd.DocApiError:
                    pass
        finally:
            _fd.get_doc_raw_text = _orig
        plugin_note = "含插件 raw_content 三态"
    except ImportError:
        plugin_note = "无插件，raw_content 三态跳过"
    print(f"_prd_common selftest ok（指纹/删除判定/残留检查，{plugin_note}）")
    return 0


if __name__ == "__main__":
    raise SystemExit(_selftest())
