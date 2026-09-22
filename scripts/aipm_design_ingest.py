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
