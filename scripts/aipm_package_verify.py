#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AI_PM 分发包校验器。只读。

设计原则：**按路径判，不按裸词判**。裸词判据会把合法资产一起打死，
而一个爱误杀的校验器等于没有校验器——报错多了人就开始无视报错。

包格式（2026-10-12）：AI_PM.zip，根平铺即一个能用的 AI_PM；升级材料在 .aipm-dist/。
路径规则、私有判据、blob / 内容指纹算法都从 aipm_package 导入，不另抄一份。

用法：
    python3 scripts/aipm_package_verify.py <AI_PM.zip> --kind public|private
退出码：0=通过，1=有问题（噪声项只提示，不影响退出码）。
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import stat
import sys
import zipfile
import zlib
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "aipm_package", Path(__file__).resolve().parent / "aipm_package.py")
_pkg = importlib.util.module_from_spec(_spec)
assert _spec.loader
_spec.loader.exec_module(_pkg)
DIST = _pkg.DIST
path_problems = _pkg.path_problems

# 任何包都不得包含的路径片段（比较时忽略大小写）。每条都是「带上下文的路径」而非裸词：
#   - `.d2c/config.json` 只拦 MasterGo PAT 那一份；tsconfig.json / style-config.json 是合法资产
#   - `.ai-shared/conversations` 而不是 `conversations`：ai-sync 的 snapshot-*-conversations.sh
#     是产出对话归档的工具脚本，本来就该随仓库分发
#   - 仓库根 docs/ 单独按前缀拦（ROOT_FORBIDDEN）：蒸馏包里的 content-full/docs/ 是内容
FORBIDDEN = [
    ".ai-shared/conversations",
    ".ai-shared/memory-snapshots",
    ".claude/projects",
    ".claude/settings.local.json",
    "settings.local.json",
    ".d2c/config.json",
    "capability-registry.local.",  # 本机注册表（外部 skill 名，Ruling 13）
    "output/projects/",
    "metrics-query/.env",  # 个人的数据平台密钥，私有包也只带 metrics-query 安装件（2026-10-12）
    "/.git/",  # 嵌套 git 仓库（内部提交历史）绝不能混进任何分发包（2026-10-10）
]
ROOT_FORBIDDEN = ["docs/"]

# 噪声项：vendor / 私有 skill 内真实存在的系统文件，提示但不计入退出码
WARN_ONLY = [".DS_Store"]

REQUIRED = [
    "CLAUDE.md",
    ".claude/skills/ai-pm/SKILL.md",  # 解压后在根下能找到它 = /ai-pm 能被识别（这次的病根）
    _pkg.IGNORE_FILE,
    f"{DIST}/versions.json",
    f"{DIST}/manifest.json",
    f"{DIST}/changelog.md",
    f"{DIST}/README.md",
    f"{DIST}/history/index.json",
    f"{DIST}/history/revisions.json",
]
DIST_FIXED = {n for n in REQUIRED if n.startswith(DIST + "/")}
BLOB_NAME = re.compile(rf"{re.escape(DIST)}/history/([0-9a-f]{{12}})\.blob")
GENERATED_ROOT = {_pkg.IGNORE_FILE}

# 体积上界（MB，zip 文件本身）。2026-10-12 实测：公共 10.5 MB、私有 44 MB
MAX_MB = {"public": 30, "private": 100}
MAX_MB_DEFAULT = 100
# 解压后的上界：超了就不去真解压（testzip 会按声明大小解开每个条目）
MAX_FILE_MB = 64
MAX_TOTAL_MB = 2048
_READ_ERRORS = (RuntimeError, NotImplementedError, zipfile.BadZipFile, zlib.error, OSError, EOFError)


_key = _pkg._path_key  # 与打包器的 duplicate_problems 同一把归一化钥匙


def forbidden_problems(n: str) -> list[str]:
    low = n.lower()
    if (any(f.lower() in low for f in FORBIDDEN) or any(low.startswith(p) for p in ROOT_FORBIDDEN)
            or ".git" in low.split("/")):
        return [f"禁止路径混入：{n}"]
    return []


def _read(zf: zipfile.ZipFile, name: str, problems: list[str]) -> bytes | None:
    try:
        return zf.read(name)
    except _READ_ERRORS as exc:
        problems.append(f"读不出 {name}：{exc}")
        return None


def _load_json(zf: zipfile.ZipFile, files: dict, name: str, problems: list[str]):
    """缺失返回 None（缺失已由必备文件检查报过）；读坏了记一条问题再返回 None。"""
    if name not in files:
        return None
    data = _read(zf, name, problems)
    if data is None:
        return None
    try:
        return json.loads(data.decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as exc:
        problems.append(f"{name} 读不出合法 JSON：{exc}")
        return None


def collect_warnings(zip_path: Path) -> list[str]:
    """噪声项提示。单独一个函数，方便 CLI 打印而 verify() 保持纯问题清单。"""
    try:
        with zipfile.ZipFile(zip_path) as zf:
            names = zf.namelist()
    except Exception:  # noqa: BLE001 —— 打不开的包由 verify() 报，这里只管提示，绝不能崩
        return []
    return [f"噪声文件（不阻断）：{n}" for n in names for w in WARN_ONLY if w in n]


def _scan_entries(zf: zipfile.ZipFile, problems: list[str]) -> tuple[dict, bool]:
    """逐条目查路径、类型、属性、大小。返回 (普通文件名 → info, 内容是否可以放心读)。"""
    files: dict[str, zipfile.ZipInfo] = {}
    seen: dict[str, str] = {}
    dirs: dict[str, str] = {}
    total, readable = 0, True
    for info in zf.infolist():
        n = info.filename
        if _key(n) in seen:
            problems.append(f"包内存在重复路径（忽略大小写和 Unicode 写法后）：{seen[_key(n)]} 与 {n}")
        else:
            seen[_key(n)] = n
        parts = n.rstrip("/").split("/")
        for i in range(1, len(parts)):
            dirs.setdefault(_key("/".join(parts[:i])), "/".join(parts[:i]))
        problems.extend(path_problems(n) + forbidden_problems(n))
        if info.flag_bits & 0x1:
            problems.append(f"加密条目：{n}")
            readable = False
        if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
            problems.append(f"不支持的压缩方式（{info.compress_type}）：{n}")
            readable = False
        if info.create_system != 3:
            problems.append(f"条目缺 Unix 权限信息（create_system={info.create_system}）：{n}")
            continue
        if info.is_dir():
            continue
        mode = info.external_attr >> 16
        if stat.S_ISLNK(mode):
            problems.append(f"符号链接：{n}")
            continue
        if not stat.S_ISREG(mode):
            problems.append(f"非普通文件：{n}")
            continue
        if info.file_size > MAX_FILE_MB << 20:
            problems.append(f"单个文件解压后超过 {MAX_FILE_MB} MB：{n}")
            readable = False
        total += info.file_size
        files[n] = info
    for n in files:
        if _key(n) in dirs:
            problems.append(f"文件与目录重名（忽略大小写后）：{n} 与 {dirs[_key(n)]}/")
    if total > MAX_TOTAL_MB << 20:
        problems.append(f"解压后总量超过 {MAX_TOTAL_MB} MB")
        readable = False
    if readable:
        try:
            bad = zf.testzip()
        except _READ_ERRORS as exc:
            problems.append(f"zip 内容读不出来：{exc}")
            readable = False
        else:
            if bad:
                problems.append(f"CRC 校验失败：{bad}")
                readable = False
    return files, readable


def _check_layout(files: dict, kind: str, problems: list[str]) -> None:
    for r in REQUIRED:
        if r not in files:
            problems.append(f"缺少必需文件：{r}")
    dist_low = DIST.lower() + "/"
    for n in files:
        if n.lower().startswith(dist_low) and n not in DIST_FIXED and not BLOB_NAME.fullmatch(n):
            problems.append(f"{DIST}/ 里出现白名单外的文件：{n}")
    # kind：既查自报，也查内容。私有包被当公共包发出去，是这套工具里后果最重的一种错。
    if kind == "public":
        for n in files:
            if _pkg.is_private_only(n):
                problems.append(f"公共包混入私有内容：{n}")
    else:
        for s in _pkg.PRIVATE_SENTINELS:
            if s not in files:
                problems.append(f"私有包缺关键文件：{s}")


def _check_contents(zf: zipfile.ZipFile, files: dict, kind: str, problems: list[str]) -> None:
    if _pkg.IGNORE_FILE in files:
        if _read(zf, _pkg.IGNORE_FILE, problems) != _pkg.IGNORE_CONTENT.encode("utf-8"):
            problems.append(f".ignore 内容应为 {_pkg.IGNORE_CONTENT!r}：它挡住历史原件，不让 Claude 搜到旧规则")
    body = [n for n in files if not n.startswith(DIST + "/") and n not in GENERATED_ROOT]
    blobs = {}
    for n in body:
        data = _read(zf, n, problems)
        if data is not None:
            blobs[n] = _pkg.git_blob_id(data)

    meta = _load_json(zf, files, f"{DIST}/versions.json", problems)
    if meta is not None and not isinstance(meta, dict):
        problems.append("versions.json 格式错误：顶层必须是对象")
    elif isinstance(meta, dict):
        if meta.get("schema") != 2:
            problems.append(f"versions.json schema 应为 2，实际 {meta.get('schema')!r}")
        if meta.get("kind") != kind:
            problems.append(f"kind 不符：包内声明 {meta.get('kind')!r}，校验按 {kind!r}")
        if not isinstance(meta.get("commit"), str) or not re.fullmatch(r"[0-9a-f]{40}", meta["commit"]):
            problems.append(f"versions.json commit 应为 40 位十六进制：{meta.get('commit')!r}")
        if not isinstance(meta.get("commit_time"), str):
            problems.append("versions.json 缺 commit_time")
        count = meta.get("file_count")
        if not isinstance(count, int) or count < 0:
            problems.append("versions.json 格式错误：file_count 必须是非负整数")
        elif count != len(body):
            problems.append(f"file_count 不符：包内声明 {count}，实际 {len(body)}")
        if len(blobs) == len(body) and meta.get("content_digest") != _pkg.content_digest(blobs):
            problems.append("versions.json content_digest 与包内实际内容不符")
        probes = meta.get("probe_paths")
        if not isinstance(probes, list) or not probes:
            problems.append("versions.json 缺 probe_paths")
        else:
            for p in probes:
                if not isinstance(p, str):
                    problems.append(f"probe_paths 里有非字符串条目：{p!r}")
                elif p not in files:
                    problems.append(f"probe_paths 里的路径不在包里：{p}")

    manifest = _load_json(zf, files, f"{DIST}/manifest.json", problems)
    if manifest is not None and not isinstance(manifest, dict):
        problems.append("manifest.json 格式错误：顶层必须是对象")
    elif isinstance(manifest, dict):
        for path, entry in manifest.items():
            problems.extend(path_problems(path) + forbidden_problems(path))
            if not _pkg.is_managed(path):
                problems.append(f"清单里出现非受管路径：{path}")
            if path not in files:
                problems.append(f"清单里的文件不在包里：{path}")
                continue
            if not isinstance(entry, dict):
                problems.append(f"清单条目格式错误：{path}")
                continue
            if path in blobs and blobs[path] != entry.get("blob"):
                problems.append(f"清单 blob 不符：{path}")
            if bool((files[path].external_attr >> 16) & 0o111) != bool(entry.get("exec")):
                problems.append(f"清单执行位不符：{path}")

    index = _load_json(zf, files, f"{DIST}/history/index.json", problems)
    allowed_by_path: dict[str, set] = {}
    if index is not None:
        try:
            if not isinstance(index, dict):
                raise ValueError("索引不是对象")
            for path, entries in index.items():
                if not isinstance(path, str) or not isinstance(entries, list):
                    raise ValueError(f"索引条目格式错误：{path!r}")
                problems.extend(path_problems(path) + forbidden_problems(path))
                if kind == "public" and _pkg.is_private_only(path):
                    problems.append(f"公共包历史里混入私有路径：{path}")
                allowed_by_path[path] = set()
                for entry in entries:
                    blob = entry["blob"]
                    if not isinstance(blob, str) or not re.fullmatch(r"[0-9a-f]{12}", blob):
                        raise ValueError(f"非法 blob 标识：{blob!r}")
                    allowed_by_path[path].add(blob)
                    name = f"{DIST}/history/{blob}.blob"
                    if name not in files:
                        problems.append(f"history 索引指向缺失 blob：{path} → {blob}")
                        continue
                    data = _read(zf, name, problems)
                    if data is not None and _pkg.git_blob_id(data) != blob:
                        problems.append(f"history blob 内容校验失败：{path} → {blob}")
        except (AttributeError, KeyError, TypeError, ValueError) as exc:
            problems.append(f"history/index.json 格式错误：{exc}")

    revisions = _load_json(zf, files, f"{DIST}/history/revisions.json", problems)
    if revisions is not None and index is not None:
        try:
            if revisions.get("schema_version") != 1 or not isinstance(revisions.get("revisions"), list):
                raise ValueError("缺少 schema_version=1 或 revisions 列表")
            for revision in revisions["revisions"]:
                if not isinstance(revision.get("version"), str) or not isinstance(revision.get("files"), dict):
                    raise ValueError("版本快照结构错误")
                for path, blob in revision["files"].items():
                    if blob not in allowed_by_path.get(path, set()):
                        problems.append(f"版本快照引用未收录原件：{revision['version']} {path} → {blob}")
        except (AttributeError, KeyError, TypeError, ValueError) as exc:
            problems.append(f"history/revisions.json 格式错误：{exc}")


def verify(zip_path: Path, kind: str) -> list[str]:
    """校验一个包，返回问题清单。空列表 = 通过。只读：不解压到磁盘，不抛异常。"""
    problems: list[str] = []
    try:
        zf = zipfile.ZipFile(zip_path)
    except Exception as exc:  # noqa: BLE001 —— 坏文件名编码会抛 UnicodeDecodeError 等，一律当坏包报
        return [f"不是合法的 zip：{exc}"]
    with zf:
        files, readable = _scan_entries(zf, problems)
        _check_layout(files, kind, problems)
        if readable:
            _check_contents(zf, files, kind, problems)
        else:
            problems.append("包内容不可信，已跳过清单、历史和版本信息的核对")
    size_mb = zip_path.stat().st_size / 1024 / 1024
    limit = MAX_MB.get(kind, MAX_MB_DEFAULT)
    if size_mb > limit:
        problems.append(f"体积超上界：{size_mb:.1f} MB > {limit} MB（kind={kind}）")
    return problems


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="AI_PM 分发包校验器（只读）")
    ap.add_argument("package")
    ap.add_argument("--kind", choices=["public", "private"], required=True)
    args = ap.parse_args(argv)

    zip_path = Path(args.package).expanduser()
    problems = verify(zip_path, args.kind)
    warnings = collect_warnings(zip_path)
    for w in warnings:
        print(f"💡 {w}")
    if problems:
        print(f"⛔ 校验未过（{len(problems)} 项）：")
        for p in problems:
            print(f"   - {p}")
        return 1
    suffix = f"（{len(warnings)} 条噪声提示，不影响结论）" if warnings else ""
    print(f"✅ 包校验通过{suffix}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
