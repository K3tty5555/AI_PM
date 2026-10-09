#!/usr/bin/env python3
"""intake 内容标题抽取（deep-scan 设计 §2）——从 aipm_intake_scan 拆出（Ruling 24），行为不变。

纯 stdlib、正则加状态机抽取，绝不走标准库 XML 解析器（本机解析器没有实体膨胀防护）。
对外：raw_title（按扩展名读内容取原始标题，失败/不读的类型返回 None）、clean_title、md_escape、
decode_text、text_title 与读取上限常量。凭证过滤（accept）留在 scan，那里持有凭证正则单源。
"""
from __future__ import annotations
import html, os, posixpath, re, unicodedata, zipfile
from pathlib import Path

TITLE_READ_LIMIT = 2 << 20      # 单文件/单 zip 成员最多读 2MB（+1 字节判超限），不信 ZipInfo.file_size
ZIP_MEMBER_CAP = 2000           # 中央目录成员数上限，超了直接文件名兜底
TITLE_MAX_CHARS = 80
OLE_MAGIC = b"\xD0\xCF\x11\xE0"  # 老 Office 复合文档（.doc/.xls/.ppt，及加密的 docx/pptx）
TEXT_TITLE_EXTS = {".md", ".markdown", ".txt"}
HTML_TITLE_EXTS = {".html", ".htm"}
_DTD_RE = re.compile(rb"<!(?i:doctype|entity)")
# 线性时间约束：标签用 <[^<>]*>（遇下一个 < 就停，恶意的未闭合标签不会回溯成平方级），段落/文本靠状态机走；
# 不写 (.*?)</x> 这类跨标签懒匹配。属性只在 ≤2KB 的单个标签串里取。
_MD_HEADING_RE = re.compile(r"^[ \t]{0,3}#{1,6}[ \t]*(\S[^\n]*)", re.M)
_TAG_RE = re.compile(r"<[^<>]*>")
_ATTR_TAG_MAX = 2048
_XML_ENTITY_RE = re.compile(r"&(lt|gt|amp|quot|apos|#[0-9]{1,8}|#x[0-9a-fA-F]{1,6});")
_XML_NAMED = {"lt": "<", "gt": ">", "amp": "&", "quot": '"', "apos": "'"}
_MD_SPECIAL_RE = re.compile(r"([\\`*_\[\]<>#|])")


class _TitleFail(Exception):
    """标题抽取放弃 → 用文件名兜底（计 titles_fallback，不计 skipped_unreadable）。"""


def _clean_title(s: str | None) -> str:
    """去换行与控制/格式字符（含 bidi 覆写）、压空白、截 80 字。不做 markdown 转义（写报告时再转）。"""
    if not s:
        return ""
    out = []
    for ch in s[:TITLE_MAX_CHARS * 25]:  # 先粗截：超长单行不逐字符跑 unicodedata
        if ch in "\r\n\t\v\f\u2028\u2029\x85":
            out.append(" ")
        elif unicodedata.category(ch) in ("Cc", "Cf", "Cs", "Co"):
            continue
        else:
            out.append(ch)
    return re.sub(r"\s+", " ", "".join(out)).strip()[:TITLE_MAX_CHARS]


def _md_escape(s: str) -> str:
    return _MD_SPECIAL_RE.sub(r"\\\1", s)


def _decode(data: bytes, truncated: bool) -> str | None:
    """先 utf-8（容 BOM）再 gb18030；被截断时容忍末尾半个多字节字符。都不行 → None（用文件名）。"""
    for enc in ("utf-8-sig", "gb18030"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError as e:
            if truncated and e.start >= len(data) - 4:
                try:
                    return data[:e.start].decode(enc)
                except UnicodeDecodeError:
                    pass
    return None


def _text_title(text: str) -> str:
    """md/txt：跳过 YAML front matter；首个 # 标题，无则首个非空行。"""
    if text.startswith("---"):
        m = re.match(r"---[^\n]*\n.*?\n---[ \t]*(?:\n|$)", text, re.S)
        if m:
            text = text[m.end():]
    m = _MD_HEADING_RE.search(text)
    if m:
        h = m.group(1).rstrip()  # rstrip 线性；先剥收尾 ### 再截断，否则截断会改变语义
        bare = h.rstrip("#")  # ATX 收尾的 ###（前面须是空白）不算标题内容
        if bare != h and (not bare or bare[-1] in " \t"):
            h = bare.rstrip()
        h = h[:TITLE_MAX_CHARS * 25]
        if _clean_title(h):
            return h
    for line in text.splitlines():
        if line.strip():
            return line
    return ""


def _xml_unescape(s: str) -> str:
    """只处理 5 个预定义实体与数字实体；其余原样保留（不展开任何 DTD 实体）。"""
    def rep(m):
        k = m.group(1)
        if k in _XML_NAMED:
            return _XML_NAMED[k]
        try:
            n = int(k[2:], 16) if k[1] in "xX" else int(k[1:])
            return chr(n) if 0 < n <= 0x10FFFF and not 0xD800 <= n <= 0xDFFF else ""
        except ValueError:
            return ""
    return _XML_ENTITY_RE.sub(rep, s)


def _zip_open(p: Path) -> zipfile.ZipFile:
    """打开前先看魔数（OLE 老格式/加密 Office）与 EOCD 记录的成员数，超上限不建 ZipFile。"""
    with p.open("rb") as fh:
        if fh.read(4) == OLE_MAGIC:
            raise _TitleFail("OLE")
        fh.seek(0, os.SEEK_END)
        size = fh.tell()
        fh.seek(max(0, size - 66000))
        tail = fh.read()
    i = tail.rfind(b"PK\x05\x06")
    if i < 0 or i + 12 > len(tail):
        raise _TitleFail("no EOCD")
    if int.from_bytes(tail[i + 10:i + 12], "little") > ZIP_MEMBER_CAP:  # 0xFFFF（zip64）也落在这里
        raise _TitleFail("too many members")
    zf = zipfile.ZipFile(p)
    if len(zf.infolist()) > ZIP_MEMBER_CAP:
        zf.close()
        raise _TitleFail("too many members")
    return zf


def _zip_member(zf: zipfile.ZipFile, name: str) -> str:
    """读成员最多 LIMIT+1 字节（不信 ZipInfo.file_size）；含 DOCTYPE/ENTITY 整份放弃；超限只用已读部分。"""
    try:
        with zf.open(name) as fh:
            data = fh.read(TITLE_READ_LIMIT + 1)
    except KeyError:
        raise _TitleFail("member missing")
    if _DTD_RE.search(data):
        raise _TitleFail("DTD")
    return data[:TITLE_READ_LIMIT].decode("utf-8", "ignore")


def _tags(xml: str):
    """线性切分：依次产出 (tag, None) 或 (None, text)。"""
    pos = 0
    for m in _TAG_RE.finditer(xml):
        if m.start() > pos:
            yield None, xml[pos:m.start()]
        yield m.group(), None
        pos = m.end()
    if pos < len(xml):
        yield None, xml[pos:]


def _tag_info(tag: str) -> tuple[str, bool, bool]:
    """'<w:p w:x="1">' → ('w:p', 是否闭合标签, 是否自闭合)。"""
    closing = tag.startswith("</")
    body = tag[2:-1] if closing else tag[1:-1]
    self_close = body.endswith("/")
    parts = body.rstrip("/").split(None, 1)
    return (parts[0] if parts else ""), closing, self_close


def _attr(tag: str, name_re: str) -> str | None:
    if len(tag) > _ATTR_TAG_MAX:
        return None
    m = re.search(r"(?:^|\s)" + name_re + r"=\"([^\"<>]*)\"", tag)
    return m.group(1) if m else None


def _docx_title(p: Path) -> str:
    """首个非空段落：同段多个 <w:t> 拼接（<w:tab/> 等不算文本），空段跳过；文本框嵌套段并入外层段。"""
    with _zip_open(p) as zf:
        doc = _zip_member(zf, "word/document.xml")
    depth, buf, in_t = 0, [], False
    for tag, text in _tags(doc):
        if tag is None:
            if in_t and depth:
                buf.append(text)
            continue
        name, closing, self_close = _tag_info(tag)
        if name == "w:p" and not self_close:
            if not closing:
                depth += 1
            elif depth:
                depth -= 1
                if depth == 0:
                    t = _xml_unescape("".join(buf))
                    if t.strip():
                        return t
                    buf = []
        elif name == "w:t":
            in_t = not closing and not self_close
    t = _xml_unescape("".join(buf))  # 成员被 2MB 截断、末段未闭合：用已读到的部分
    if t.strip():
        return t
    raise _TitleFail("no text")


def _pptx_first_slide(zf: zipfile.ZipFile) -> str:
    """presentation.xml 的 sldIdLst 第一个 r:id → presentation.xml.rels → slide 路径（不是 slide1.xml）。"""
    rid, in_lst = None, False
    for tag, _ in _tags(_zip_member(zf, "ppt/presentation.xml")):
        if tag is None:
            continue
        name, closing, self_close = _tag_info(tag)
        if name == "p:sldIdLst" and not self_close:
            in_lst = not closing
        elif in_lst and name == "p:sldId" and not closing:
            rid = _attr(tag, r"\w+:id")
            break
    if not rid:
        raise _TitleFail("no sldIdLst")
    for tag, _ in _tags(_zip_member(zf, "ppt/_rels/presentation.xml.rels")):
        if tag is not None and _tag_info(tag)[0] == "Relationship" and _attr(tag, "Id") == rid:
            target = _attr(tag, "Target")
            if not target:
                break
            name = target.lstrip("/") if target.startswith("/") else posixpath.normpath("ppt/" + target)
            if name.startswith(".."):
                raise _TitleFail("rel escapes")
            return name
    raise _TitleFail("rel missing")


def _pptx_title(p: Path) -> str:
    """首张幻灯片里 type=title/ctrTitle 占位符所在 <p:sp> 的文本；没有则该页第一段文本。"""
    with _zip_open(p) as zf:
        slide = _zip_member(zf, _pptx_first_slide(zf))
    sp_depth, is_title, sp_paras = 0, False, []
    para, in_t, first = None, False, None
    for tag, text in _tags(slide):
        if tag is None:
            if in_t and para is not None:
                para.append(text)
            continue
        name, closing, self_close = _tag_info(tag)
        if name == "p:sp" and not self_close:
            if not closing:
                sp_depth += 1
                if sp_depth == 1:
                    is_title, sp_paras = False, []
            elif sp_depth:
                sp_depth -= 1
                if sp_depth == 0 and is_title:
                    t = " ".join(x for x in sp_paras if x.strip())
                    if t.strip():
                        return t
        elif name == "p:ph" and sp_depth and not closing:
            is_title = is_title or _attr(tag, "type") in ("title", "ctrTitle")
        elif name == "a:p" and not self_close:
            if not closing:
                para = []
            elif para is not None:
                t = _xml_unescape("".join(para))
                if first is None and t.strip():
                    first = t
                if sp_depth:
                    sp_paras.append(t)
                para = None
        elif name == "a:t":
            in_t = not closing and not self_close
    if first:
        return first
    raise _TitleFail("no text")


def _html_title(text: str) -> str:
    """<title> 用 find 线性定位（不用跨标签懒匹配）；只认 <title> / <title 属性>。"""
    low = text.lower()
    i = low.find("<title")
    while i >= 0 and low[i + 6:i + 7] not in (">", " ", "\t", "\n", "\r"):
        i = low.find("<title", i + 1)
    if i < 0:
        return ""
    j = low.find(">", i)
    k = low.find("</title", j + 1) if j >= 0 else -1
    return html.unescape(text[j + 1:k]) if k >= 0 else ""


def _read_head(p: Path) -> str:
    with p.open("rb") as fh:
        data = fh.read(TITLE_READ_LIMIT + 1)
    text = _decode(data[:TITLE_READ_LIMIT], len(data) > TITLE_READ_LIMIT)
    if text is None:
        raise _TitleFail("undecodable")
    return text


def raw_title(p: Path, ext: str) -> str | None:
    """按扩展名读内容取原始标题（未清洗）；读不了/不读的类型（xlsx/pdf/老格式…）返回 None → 文件名兜底。"""
    try:
        if ext in TEXT_TITLE_EXTS:
            return _text_title(_read_head(p))
        if ext in HTML_TITLE_EXTS:
            return _html_title(_read_head(p))
        if ext == ".docx":
            return _docx_title(p)
        if ext == ".pptx":
            return _pptx_title(p)
        return None
    except Exception:  # noqa: BLE001 —— 标题是锦上添花：坏 zip/加密/解码失败一律文件名兜底，不中断扫描
        return None


# 对外名（scan 及测试按这些名字消费）
clean_title = _clean_title
md_escape = _md_escape
decode_text = _decode
text_title = _text_title
