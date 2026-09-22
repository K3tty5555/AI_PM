#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MasterGo 设计稿抽取：抓 DSL 与 CSS、合并、抽 token、几何还原。

只用 Python 标准库。MasterGo host 不硬编码，从 .d2c/config.json 或
MASTERGO_BASE_URL 读取，避免把部署域名写进版本库。
"""

from __future__ import annotations

import datetime
import html as html_lib
import json
import os
from pathlib import Path
import re
import subprocess
from typing import Any
import urllib.request
from urllib.parse import parse_qs, quote, urlsplit

SCHEMA_VERSION = 1
DEFAULT_CONFIG_PATH = Path(".d2c/config.json")
AUTH_HEADER = "X-MG-UserAccessToken"


class DesignIngestError(ValueError):
    pass


def resolve_config(
    base_url: str | None = None,
    token: str | None = None,
    config_path: Path | None = None,
) -> dict[str, str]:
    """显式参数 > 环境变量 > 配置文件。三处都没有就报错并给出配置方法。"""
    data: dict[str, Any] = {}
    path = DEFAULT_CONFIG_PATH if config_path is None else config_path
    if path.is_file():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise DesignIngestError(f"配置文件 JSON 格式错误: {path}: {exc.msg}") from exc
        if isinstance(loaded, dict):
            data = loaded

    resolved_base = base_url or os.environ.get("MASTERGO_BASE_URL") or data.get("mastergo_base_url")
    resolved_token = token or os.environ.get("MASTERGO_TOKEN") or data.get("mastergo_api_key")

    if not resolved_base:
        raise DesignIngestError(
            "缺少 MasterGo 站点地址。设置环境变量 MASTERGO_BASE_URL，"
            "或在 .d2c/config.json 里写 mastergo_base_url（该目录已 gitignore）。"
        )
    if not resolved_token:
        raise DesignIngestError(
            "缺少 MasterGo 访问令牌。设置环境变量 MASTERGO_TOKEN，"
            "或在 .d2c/config.json 里写 mastergo_api_key（该目录已 gitignore）。"
        )
    return {"base_url": str(resolved_base).rstrip("/"), "token": str(resolved_token)}


def parse_design_url(url: str) -> tuple[str, list[str]]:
    """取 fileId 与全部 layer_id。layer_id 解码后保留复合路径，不按斜杠截断。"""
    parts = urlsplit(url)
    segments = [seg for seg in parts.path.split("/") if seg]
    file_id = ""
    for index, seg in enumerate(segments):
        if seg == "file" and index + 1 < len(segments):
            file_id = segments[index + 1]
            break
    if not file_id:
        raise DesignIngestError(f"URL 里找不到 fileId（期望形如 /file/<id>）: {url}")

    query = parse_qs(parts.query, keep_blank_values=False)
    layers = [value for value in query.get("layer_id", []) if value]
    if not layers:
        hint = "；只给 page_id 不行，page_id 是画布不是画板" if query.get("page_id") else ""
        raise DesignIngestError(f"URL 里缺少 layer_id{hint}: {url}")
    return file_id, layers


def _default_opener(request: urllib.request.Request) -> bytes:
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def _get_json(cfg: dict[str, str], path: str, file_id: str, layer_id: str, opener) -> Any:
    url = f"{cfg['base_url']}{path}?fileId={quote(file_id, safe='')}&layerId={quote(layer_id, safe='')}"
    request = urllib.request.Request(url, headers={
        AUTH_HEADER: cfg["token"],
        "Accept": "application/json",
    })
    raw = (opener or _default_opener)(request)
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise DesignIngestError(f"{path} 返回的不是 JSON: {raw[:120]!r}") from exc


def fetch_layer(
    cfg: dict[str, str],
    file_id: str,
    layer_id: str,
    opener=None,
    require_nodes: bool = False,
) -> dict[str, Any]:
    """两个端点都要打：dsl 给宽高与结构，style 给现成 CSS，谁也替代不了谁。"""
    dsl = _get_json(cfg, "/mcp/dsl", file_id, layer_id, opener)
    css = _get_json(cfg, "/mcp/style", file_id, layer_id, opener)
    if isinstance(dsl, dict) and dsl.get("code"):
        raise DesignIngestError(f"MasterGo 返回错误 {dsl.get('code')}: {dsl.get('message')}")
    if not isinstance(dsl, dict) or "nodes" not in dsl:
        raise DesignIngestError(f"/mcp/dsl 响应结构异常: {str(dsl)[:120]}")
    if require_nodes and not dsl.get("nodes"):
        raise DesignIngestError(
            f"layerId={layer_id} 没有任何节点。确认它是画板（frame）而不是画布（page_id）。"
        )
    return {"dsl": dsl, "css": css if isinstance(css, list) else []}


_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify_page_id(name: str, layer_id: str) -> str:
    """名字能 slug 就用名字，中文或空则退回 layer_id。产物路径不放非 ASCII。"""
    slug = _SLUG_RE.sub("-", (name or "").strip().lower()).strip("-")
    if slug:
        return slug
    return _SLUG_RE.sub("-", layer_id.lower()).strip("-")


def index_css(css: list[dict]) -> dict[str, str]:
    """把 /mcp/style 的嵌套树压平成 {node_id: cssCode}。"""
    index: dict[str, str] = {}

    def walk(items):
        for item in items or []:
            if isinstance(item, dict) and item.get("id"):
                index[item["id"]] = item.get("cssCode") or ""
                walk(item.get("children"))

    walk(css)
    return index


def _variant_of(node: dict) -> dict[str, Any]:
    info = node.get("componentInfo")
    if isinstance(info, dict):
        properties = info.get("properties")
        if isinstance(properties, dict):
            return {str(k): v for k, v in properties.items()}
    return {}


def build_structure(dsl: dict, css: list[dict], layer_id: str) -> dict[str, Any]:
    roots = dsl.get("nodes") or []
    if not roots:
        raise DesignIngestError(f"layerId={layer_id} 没有节点，确认它是画板不是画布")
    root = roots[0]
    css_index = index_css(css)

    nodes: list[dict[str, Any]] = []
    navigations: list[dict[str, Any]] = []
    texts: list[str] = []

    def walk(node: dict, base_x: float, base_y: float, depth: int) -> None:
        layout = node.get("layoutStyle") or {}
        x = base_x + float(layout.get("relativeX") or 0)
        y = base_y + float(layout.get("relativeY") or 0)
        variant = _variant_of(node)
        text = "".join(
            run.get("text", "") for run in (node.get("text") or []) if isinstance(run, dict)
        )
        # PATH 的矢量数据实测恒为空，标成图标占位交给下游替换
        raw_path = node.get("path")
        icon_placeholder = node.get("type") == "PATH" and not raw_path

        entry: dict[str, Any] = {
            "id": node.get("id"),
            "type": node.get("type"),
            "name": node.get("name"),
            "depth": depth,
            "x": x,
            "y": y,
            "width": float(layout.get("width") or 0),
            "height": float(layout.get("height") or 0),
            "css": css_index.get(node.get("id"), ""),
            "token": node.get("_token"),
            "fill": node.get("fill"),
            "color": node.get("_color"),
            "font": (node.get("text") or [{}])[0].get("font") if node.get("text") else None,
            "text_color": (node.get("textColor") or [{}])[0].get("color") if node.get("textColor") else None,
            "text_align": node.get("textAlign"),
            "border_radius": node.get("borderRadius"),
            "effect": node.get("effect"),
            "opacity": node.get("opacity"),
            "flex": node.get("flexContainerInfo"),
            "component_id": node.get("componentId"),
            "variant": variant,
            "text": text,
            "icon_placeholder": icon_placeholder,
        }
        nodes.append(entry)
        if text:
            texts.append(text)
        for action in node.get("interactive") or []:
            if isinstance(action, dict) and action.get("targetLayerId"):
                navigations.append({
                    "from_id": node.get("id"),
                    "to_layer_id": action["targetLayerId"],
                    "variant": variant,
                })
        for child in node.get("children") or []:
            walk(child, x, y, depth + 1)

    root_layout = root.get("layoutStyle") or {}
    walk(root, -float(root_layout.get("relativeX") or 0), -float(root_layout.get("relativeY") or 0), 0)

    return {
        "schema_version": SCHEMA_VERSION,
        "layer_id": layer_id,
        "page_id": slugify_page_id(root.get("name") or "", layer_id),
        "canvas": {
            "width": root_layout.get("width"),
            "height": root_layout.get("height"),
        },
        "nodes": nodes,
        "navigations": navigations,
        "texts": texts,
    }


def extract_tokens(styles: dict[str, dict]) -> dict[str, Any]:
    """按色值归并别名，不按名字。名字可以有好几个，值只有一个。"""
    colors: dict[str, list[str]] = {}
    effects: dict[str, list[str]] = {}
    fonts: dict[tuple, list[str]] = {}
    images: list[dict[str, str]] = []

    for style_id, style in sorted((styles or {}).items()):
        if not isinstance(style, dict):
            continue
        name = style.get("token")
        value = style.get("value")

        if isinstance(value, dict):
            key = (
                value.get("family"), value.get("size"), value.get("weight"),
                value.get("lineHeight"), value.get("letterSpacing"),
            )
            bucket = fonts.setdefault(key, [])
            if name and name not in bucket:
                bucket.append(name)
            continue

        for item in value or []:
            if isinstance(item, dict) and item.get("url"):
                images.append({"style_id": style_id, "url": item["url"]})
                continue
            if not isinstance(item, str) or not item.strip():
                continue
            target = effects if style_id.startswith("effect") else colors
            bucket = target.setdefault(item, [])
            if name and name not in bucket:
                bucket.append(name)

    return {
        "schema_version": SCHEMA_VERSION,
        "colors": [{"value": v, "names": n} for v, n in sorted(colors.items())],
        "typography": [
            {
                "family": key[0], "size": key[1], "weight": key[2],
                "line_height": key[3], "letter_spacing": key[4], "names": names,
            }
            for key, names in sorted(fonts.items(), key=lambda kv: str(kv[0]))
        ],
        "effects": [{"value": v, "names": n} for v, n in sorted(effects.items())],
        "images": images,
    }


def merge_token_sets(sets: list[dict]) -> dict[str, Any]:
    """跨画板合并。同一套归并逻辑也给产品级蒸馏用。"""
    colors: dict[str, list[str]] = {}
    effects: dict[str, list[str]] = {}
    fonts: dict[tuple, list[str]] = {}
    images: list[dict[str, str]] = []

    for token_set in sets or []:
        for entry in token_set.get("colors", []):
            bucket = colors.setdefault(entry["value"], [])
            for name in entry.get("names", []):
                if name not in bucket:
                    bucket.append(name)
        for entry in token_set.get("effects", []):
            bucket = effects.setdefault(entry["value"], [])
            for name in entry.get("names", []):
                if name not in bucket:
                    bucket.append(name)
        for entry in token_set.get("typography", []):
            key = (
                entry.get("family"), entry.get("size"), entry.get("weight"),
                entry.get("line_height"), entry.get("letter_spacing"),
            )
            bucket = fonts.setdefault(key, [])
            for name in entry.get("names", []):
                if name not in bucket:
                    bucket.append(name)
        images.extend(token_set.get("images", []))

    return {
        "schema_version": SCHEMA_VERSION,
        "colors": [{"value": v, "names": n} for v, n in sorted(colors.items())],
        "typography": [
            {
                "family": key[0], "size": key[1], "weight": key[2],
                "line_height": key[3], "letter_spacing": key[4], "names": names,
            }
            for key, names in sorted(fonts.items(), key=lambda kv: str(kv[0]))
        ],
        "effects": [{"value": v, "names": n} for v, n in sorted(effects.items())],
        "images": images,
    }


ICON_PLACEHOLDER_COLOR = "#C9CDD4"


def render_html(structure: dict, tokens: dict, asset_map: dict[str, str] | None = None) -> str:
    """按绝对坐标还原。这是只读视觉基准，不是可交付原型。"""
    assets = asset_map or {}
    canvas = structure.get("canvas") or {}
    width = canvas.get("width") or 0
    height = canvas.get("height") or 0

    parts: list[str] = []
    for node in structure.get("nodes", []):
        declarations = [
            "position:absolute",
            f"left:{_num(node['x'])}px",
            f"top:{_num(node['y'])}px",
            f"width:{_num(node['width'])}px",
            f"height:{_num(node['height'])}px",
        ]
        # MasterGo 自己生成的 CSS 直接用，但它不带宽高，所以宽高在前面先给
        if node.get("css"):
            for declaration in node["css"].split(";"):
                declaration = declaration.strip()
                if not declaration:
                    continue
                prop = declaration.split(":", 1)[0].strip().lower()
                if prop in {"position", "left", "top", "width", "height"}:
                    continue
                declarations.append(declaration)

        asset = assets.get(node.get("fill") or "")
        if asset:
            declarations.append(f"background-image:url('{asset}')")
            declarations.append("background-size:100% 100%")

        if node.get("icon_placeholder"):
            declarations.append(f"background:{ICON_PLACEHOLDER_COLOR}")

        attrs = [
            f'data-id="{html_lib.escape(str(node.get("id")))}"',
            f'data-type="{html_lib.escape(str(node.get("type")))}"',
            f'data-name="{html_lib.escape(str(node.get("name") or ""))}"',
        ]
        if node.get("icon_placeholder"):
            attrs.append(f'data-icon="{html_lib.escape(str(node.get("name") or ""))}"')
        if node.get("token"):
            attrs.append(f'data-token="{html_lib.escape(str(node["token"]))}"')

        text = html_lib.escape(node.get("text") or "")
        if text:
            declarations.append("display:flex;align-items:center;white-space:pre-wrap")
        parts.append(
            f'<div {" ".join(attrs)} style="{";".join(declarations)}">{text}</div>'
        )

    body = "\n".join(parts)
    return (
        "<!DOCTYPE html>\n<html lang=\"zh-CN\"><head><meta charset=\"utf-8\">\n"
        f"<title>设计稿几何还原 · {html_lib.escape(str(structure.get('page_id')))}</title>\n"
        "<style>body{margin:0;background:#8A8F99}"
        f"#stage{{position:relative;width:{_num(width)}px;height:{_num(height)}px;overflow:hidden}}"
        "#stage div{box-sizing:border-box}</style></head>\n"
        f"<body><div id=\"stage\">\n{body}\n</div></body></html>\n"
    )


def _num(value: Any) -> str:
    """整数不带小数点，小数保留两位，保证输出稳定可比。"""
    number = float(value or 0)
    if number == int(number):
        return str(int(number))
    return f"{number:.2f}"


PLAYWRIGHT_CACHE = Path.home() / "Library/Caches/ms-playwright"


def find_headless_shell() -> Path | None:
    """复用本机缓存，绝不下载浏览器（CLAUDE.md 明令）。"""
    if not PLAYWRIGHT_CACHE.is_dir():
        return None
    matches = sorted(PLAYWRIGHT_CACHE.glob("chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell"))
    return matches[-1] if matches else None


def download_assets(tokens: dict, out_dir: Path, opener=None) -> dict[str, str]:
    """签名 URL 实测约 23 小时过期，当场下载，绝不持久化 URL。"""
    out_dir.mkdir(parents=True, exist_ok=True)
    mapping: dict[str, str] = {}
    for item in tokens.get("images", []):
        style_id = item["style_id"]
        filename = f"{style_id.replace(':', '_')}.png"
        target = out_dir / filename
        request = urllib.request.Request(item["url"])
        try:
            target.write_bytes((opener or _default_opener)(request))
        except Exception:
            continue
        mapping[style_id] = f"assets/{filename}"
    return mapping


def screenshot(html_path: Path, png_path: Path, width: int, height: int, runner=None) -> bool:
    if runner is not None:
        return bool(runner(html_path, png_path, width, height))
    shell = find_headless_shell()
    if shell is None:
        return False
    png_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        str(shell), "--headless", "--disable-gpu", "--no-sandbox",
        "--virtual-time-budget=4000",
        f"--window-size={int(width)},{int(height)}",
        f"--screenshot={png_path}",
        html_path.resolve().as_uri(),
    ]
    try:
        subprocess.run(command, capture_output=True, timeout=120, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return False
    return png_path.is_file() and png_path.stat().st_size > 0


def ingest(url: str, out_dir: Path, cfg: dict[str, str], opener=None, runner=None) -> dict[str, Any]:
    file_id, layer_ids = parse_design_url(url)
    out_dir.mkdir(parents=True, exist_ok=True)

    pages: list[dict[str, Any]] = []
    token_sets: list[dict[str, Any]] = []
    images: list[dict[str, Any]] = []
    all_ok = True

    for layer_id in layer_ids:
        payload = fetch_layer(cfg, file_id, layer_id, opener=opener, require_nodes=True)
        structure = build_structure(payload["dsl"], payload["css"], layer_id)
        page_id = structure["page_id"]
        tokens = extract_tokens(payload["dsl"].get("styles") or {})
        token_sets.append(tokens)

        _write_json(out_dir / "raw" / f"dsl-{page_id}.json", payload["dsl"])
        _write_json(out_dir / "raw" / f"css-{page_id}.json", payload["css"])
        _write_json(out_dir / "structures" / f"{page_id}.json", structure)

        asset_map = download_assets(tokens, out_dir / "assets", opener=opener)
        html_path = out_dir / "renders" / f"{page_id}.html"
        html_path.parent.mkdir(parents=True, exist_ok=True)
        html_path.write_text(render_html(structure, tokens, asset_map), encoding="utf-8")

        png_path = out_dir / "images" / f"{page_id}.png"
        ok = screenshot(
            html_path, png_path,
            structure["canvas"].get("width") or 1440,
            structure["canvas"].get("height") or 900,
            runner=runner,
        )
        all_ok = all_ok and ok
        pages.append({"page_id": page_id, "layer_id": layer_id, "screenshot_ok": ok})
        images.append({
            "id": f"img-{page_id}",
            "pageId": page_id,
            "label": structure.get("page_id"),
            "role": "design-render",
            "image": f"images/{page_id}.png",
            "usableForPrd": False,
            "usableForHtmlConstraint": True,
            "notes": "设计稿几何还原，只读视觉基准，不可直接当交付原型",
        })

    _write_json(out_dir / "design-tokens.json", merge_token_sets(token_sets))

    risks = ["图中文字只作视觉表达，不作 PRD 字段或用户话术事实源"]
    if not all_ok:
        risks.append("截图未完成，manifest 降级为 partial，需装好 chrome-headless-shell 后重跑")
    manifest = {
        "version": 1,
        "packageType": "visual-anchor-manifest",
        "status": "ready" if all_ok else "partial",
        "source": "mastergo",
        "generatedAt": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "generatedBy": "mastergo-ingest",
        "visualFingerprint": "visual-fingerprint.md",
        "designSource": {"provider": "mastergo", "fileId": file_id, "layerIds": layer_ids},
        "images": images,
        "knownRisks": risks,
    }
    _write_json(out_dir / "manifest.json", manifest)
    return {"pages": pages, "manifest": manifest}


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(path)


def command_ingest_design(args) -> int:
    try:
        cfg = resolve_config(
            base_url=getattr(args, "base_url", None),
            token=getattr(args, "token", None),
            config_path=Path(args.config) if getattr(args, "config", None) else None,
        )
        result = ingest(args.url, Path(args.out), cfg)
    except DesignIngestError as exc:
        print(f"FAIL: {exc}")
        return 1
    for page in result["pages"]:
        mark = "OK" if page["screenshot_ok"] else "WARN(无截图)"
        print(f"{mark} {page['page_id']}  <- layer {page['layer_id']}")
    print(f"STATUS: {result['manifest']['status']}")
    print(f"OUT: {args.out}")
    return 0
