#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MasterGo 设计稿抽取：抓 DSL 与 CSS、合并、抽 token、几何还原。

只用 Python 标准库。MasterGo host 不硬编码，从 .d2c/config.json 或
MASTERGO_BASE_URL 读取，避免把部署域名写进版本库。
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
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
