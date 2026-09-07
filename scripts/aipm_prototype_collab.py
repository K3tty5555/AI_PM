#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AI_PM prototype collaboration toolkit.

Generates low-fidelity keyframe galleries, high-fidelity review galleries, and
an embeddable local-first annotation runtime from one prototype specification.
It also provides a static HTML resource/ID gate for catching broken prototype
assets before browser review.
The implementation intentionally uses only Python's standard library.
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import html
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import shutil
import sys
from typing import Any
from html.parser import HTMLParser
from urllib.parse import parse_qsl, unquote, urlencode, urlsplit, urlunsplit


SCHEMA_VERSION = 1
ANNOTATION_MARKER = "data-aipm-annotation-runtime"

DEFAULT_VISUAL_TOKENS: dict[str, str] = {
    "canvas_background": "#ffffff",
    "surface_glass": "#ffffff",
    "surface_glass_strong": "#f4ecd6",
    "surface_paper": "#f4f8f8",
    "text_primary": "#000000",
    "text_muted": "#000000",
    "text_on_paper": "#294047",
    "accent": "#000000",
    "warning": "#875d15",
    "danger": "#ac382b",
    "glass_blur": "0px",
    "card_radius": "24px",
    "preview_height_wide": "240px",
    "preview_height_compact": "220px",
    "surface_soft": "#f7f7f5",
    "hairline": "#e6e6e6",
    "block_lime": "#dceeb1",
    "block_lilac": "#c5b0f4",
    "block_cream": "#f4ecd6",
    "block_coral": "#f3c9b6",
    "success": "#286638"
}


class SpecError(ValueError):
    pass


class PrototypeHTMLParser(HTMLParser):
    """Collect stable IDs and local resource references without requiring a DOM package."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: set[str] = set()
        self.duplicate_ids: set[str] = set()
        self.resources: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_map = dict(attrs)
        element_id = attrs_map.get("id")
        if element_id:
            if element_id in self.ids:
                self.duplicate_ids.add(element_id)
            self.ids.add(element_id)
        attribute = "href" if tag == "link" else "src"
        value = attrs_map.get(attribute)
        if value:
            self.resources.append((tag, value))


def validate_html_file(path: Path) -> list[str]:
    errors: list[str] = []
    if not path.is_file():
        return [f"HTML 文件不存在: {path}"]
    source = path.read_text(encoding="utf-8")
    if "<body" not in source.lower():
        errors.append("HTML 缺少 body")
    parser = PrototypeHTMLParser()
    try:
        parser.feed(source)
        parser.close()
    except Exception as exc:  # HTMLParser is permissive, but report malformed encodings.
        errors.append(f"HTML 解析失败: {exc}")
    for element_id in sorted(parser.duplicate_ids):
        errors.append(f"HTML id 重复: {element_id}")
    for tag, resource in parser.resources:
        parts = urlsplit(resource)
        if parts.scheme or parts.netloc or resource.startswith(("#", "data:")):
            continue
        target = (path.parent / unquote(parts.path)).resolve()
        if not target.is_file():
            errors.append(f"{tag} 本地资源不存在: {resource}")
    return errors


def load_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SpecError(f"文件不存在: {path}") from exc
    except json.JSONDecodeError as exc:
        raise SpecError(f"JSON 格式错误: {path}:{exc.lineno}:{exc.colno} {exc.msg}") from exc
    if not isinstance(data, dict):
        raise SpecError("规格根节点必须是对象")
    return data


def canonical_json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def content_hash(data: Any) -> str:
    return hashlib.sha256(canonical_json(data).encode("utf-8")).hexdigest()


def load_visual_tokens(path: Path | None = None) -> dict[str, str]:
    """Load project tokens while keeping a complete, deterministic default set."""
    tokens = dict(DEFAULT_VISUAL_TOKENS)
    if path is None:
        path = Path(__file__).resolve().parents[1] / "templates" / "prototype-collab" / "visual-tokens.json"
    if path.is_file():
        data = load_json(path)
        candidate = data.get("tokens", data)
        if isinstance(candidate, dict):
            for key, value in candidate.items():
                if key in tokens and isinstance(value, str) and value.strip():
                    tokens[key] = value.strip()
    return tokens


def visual_token_css(tokens: dict[str, str]) -> str:
    return ":root{" + "".join(
        f"--aipm-{key.replace('_', '-')}:{html.escape(value, quote=True)};"
        for key, value in tokens.items()
    ) + "}"


SOURCE_EXTENSIONS = {".html", ".htm", ".css", ".scss", ".less", ".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte", ".json", ".md"}
ASSET_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".otf"}


def scan_source_tree(source: Path) -> dict[str, Any]:
    source = source.resolve()
    if not source.is_dir():
        raise SpecError(f"源码或资料目录不存在: {source}")
    files: list[dict[str, Any]] = []
    pages: list[dict[str, Any]] = []
    components: set[str] = set()
    colors: set[str] = set()
    fonts: set[str] = set()
    layout_signals: dict[str, int] = {"grid": 0, "flex": 0, "sidebar": 0, "table": 0, "modal": 0}
    for path in sorted(p for p in source.rglob("*") if p.is_file()):
        rel = path.relative_to(source).as_posix()
        suffix = path.suffix.lower()
        if suffix not in SOURCE_EXTENSIONS and suffix not in ASSET_EXTENSIONS:
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        kind = "asset" if suffix in ASSET_EXTENSIONS else "source"
        files.append({"path": rel, "kind": kind, "size": path.stat().st_size, "sha256": digest})
        if kind == "asset":
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if suffix in {".html", ".htm", ".vue", ".svelte"}:
            title = (re.search(r"<title[^>]*>(.*?)</title>", text, re.I | re.S) or re.search(r"<h1[^>]*>(.*?)</h1>", text, re.I | re.S))
            if title:
                label = re.sub(r"<[^>]+>", " ", title.group(1)).strip()
                pages.append({"path": rel, "title": re.sub(r"\s+", " ", label)[:120]})
        for match in re.finditer(r"(?:export\s+(?:default\s+)?(?:function|class)|(?:const|function|class)\s+)([A-Z][A-Za-z0-9_]*)", text):
            components.add(match.group(1))
        colors.update(x.lower() for x in re.findall(r"#[0-9a-fA-F]{3,8}\b", text))
        fonts.update(re.sub(r"[\"']", "", x).strip() for x in re.findall(r"font-family\s*:\s*([^;}{]+)", text, re.I))
        for key, pattern in (("grid", r"display\s*:\s*grid|grid-template"), ("flex", r"display\s*:\s*flex|flex-direction"), ("sidebar", r"sidebar|side-nav|sider"), ("table", r"<table|data-table|table-"), ("modal", r"modal|dialog")):
            layout_signals[key] += len(re.findall(pattern, text, re.I))
    now = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    return {
        "schema_version": 1,
        "generated_at": now,
        "source_root": source.name,
        "summary": {
            "files": len(files),
            "source_files": sum(1 for f in files if f["kind"] == "source"),
            "assets": sum(1 for f in files if f["kind"] == "asset"),
            "pages": len(pages),
            "components": len(components),
        },
        "pages": pages,
        "components": sorted(components),
        "colors": sorted(colors),
        "fonts": sorted(fonts),
        "layout_signals": layout_signals,
        "evidence_files": files,
    }


def html_snapshot(path: Path) -> dict[str, Any]:
    source = path.read_text(encoding="utf-8", errors="replace")
    parser = PrototypeHTMLParser()
    parser.feed(source)
    headings = re.findall(r"<h([1-6])[^>]*>(.*?)</h\1>", source, re.I | re.S)
    clean_headings = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text)).strip() for _, text in headings]
    return {"sha256": hashlib.sha256(source.encode("utf-8")).hexdigest(), "ids": sorted(parser.ids), "headings": clean_headings}


def prototype_diff(old: Path, new: Path) -> dict[str, Any]:
    if not old.is_file() or not new.is_file():
        raise SpecError("版本 diff 的 old/new HTML 必须存在")
    before, after = html_snapshot(old), html_snapshot(new)
    return {
        "schema_version": 1,
        "generated_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "old": {"path": old.name, "sha256": before["sha256"]},
        "new": {"path": new.name, "sha256": after["sha256"]},
        "changed": before["sha256"] != after["sha256"],
        "ids": {"added": sorted(set(after["ids"]) - set(before["ids"])), "removed": sorted(set(before["ids"]) - set(after["ids"]))},
        "headings": {"added": sorted(set(after["headings"]) - set(before["headings"])), "removed": sorted(set(before["headings"]) - set(after["headings"]))},
    }


def require_text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise SpecError(f"{label} 必须填写")
    return value.strip()


def validate_spec(spec: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if spec.get("schema_version") != SCHEMA_VERSION:
        errors.append("schema_version 必须为 1")
    for field in ("project", "title"):
        if not isinstance(spec.get(field), str) or not spec[field].strip():
            errors.append(f"{field} 必须填写")

    pages = spec.get("pages")
    flows = spec.get("flows")
    if not isinstance(pages, list) or not pages:
        errors.append("pages 必须是非空数组")
        pages = []
    if not isinstance(flows, list) or not flows:
        errors.append("flows 必须是非空数组")
        flows = []

    page_ids: set[str] = set()
    frame_ids: set[tuple[str, str]] = set()
    page_targets: dict[str, set[str]] = {}
    for p_index, page in enumerate(pages):
        if not isinstance(page, dict):
            errors.append(f"pages[{p_index}] 必须是对象")
            continue
        page_id = page.get("page_id")
        if not isinstance(page_id, str) or not page_id:
            errors.append(f"pages[{p_index}].page_id 必须填写")
            continue
        if page_id in page_ids:
            errors.append(f"page_id 重复: {page_id}")
        page_ids.add(page_id)
        if not isinstance(page.get("title"), str) or not page["title"].strip():
            errors.append(f"页面 {page_id} 缺少 title")

        targets: set[str] = set()
        for e_index, element in enumerate(page.get("stable_elements") or []):
            if not isinstance(element, dict) or not element.get("target_id"):
                errors.append(f"页面 {page_id} stable_elements[{e_index}] 缺少 target_id")
                continue
            target_id = str(element["target_id"])
            if target_id in targets:
                errors.append(f"页面 {page_id} target_id 重复: {target_id}")
            targets.add(target_id)
        page_targets[page_id] = targets

        states = page.get("states")
        if not isinstance(states, list) or not states:
            errors.append(f"页面 {page_id} states 必须是非空数组")
            continue
        local_states: set[str] = set()
        for s_index, state in enumerate(states):
            if not isinstance(state, dict):
                errors.append(f"页面 {page_id} states[{s_index}] 必须是对象")
                continue
            state_id = state.get("state_id")
            if not isinstance(state_id, str) or not state_id:
                errors.append(f"页面 {page_id} states[{s_index}] 缺少 state_id")
                continue
            if state_id in local_states:
                errors.append(f"页面 {page_id} state_id 重复: {state_id}")
            local_states.add(state_id)
            frame_ids.add((page_id, state_id))
            if not isinstance(state.get("title"), str) or not state["title"].strip():
                errors.append(f"关键帧 {page_id}/{state_id} 缺少 title")
            layout = state.get("layout")
            if not isinstance(layout, list) or not layout:
                errors.append(f"关键帧 {page_id}/{state_id} layout 必须是非空数组")

    flow_ids: set[str] = set()
    step_ids: set[str] = set()
    for f_index, flow in enumerate(flows):
        if not isinstance(flow, dict):
            errors.append(f"flows[{f_index}] 必须是对象")
            continue
        flow_id = flow.get("flow_id")
        if not isinstance(flow_id, str) or not flow_id:
            errors.append(f"flows[{f_index}].flow_id 必须填写")
            continue
        if flow_id in flow_ids:
            errors.append(f"flow_id 重复: {flow_id}")
        flow_ids.add(flow_id)
        steps = flow.get("steps")
        if not isinstance(steps, list) or not steps:
            errors.append(f"流程 {flow_id} steps 必须是非空数组")
            continue
        for index, step in enumerate(steps):
            if not isinstance(step, dict):
                errors.append(f"流程 {flow_id} steps[{index}] 必须是对象")
                continue
            step_id = step.get("step_id")
            if not isinstance(step_id, str) or not step_id:
                errors.append(f"流程 {flow_id} steps[{index}] 缺少 step_id")
            elif step_id in step_ids:
                errors.append(f"step_id 全局重复: {step_id}")
            else:
                step_ids.add(step_id)
            key = (step.get("page_id"), step.get("state_id"))
            if key not in frame_ids:
                errors.append(f"流程 {flow_id} 引用了不存在的关键帧: {key[0]}/{key[1]}")
            target_id = step.get("target_id")
            if target_id and key[0] in page_targets and target_id not in page_targets[key[0]]:
                errors.append(f"流程 {flow_id} 引用了未登记 target_id: {key[0]}/{target_id}")
    return errors


def validate_feedback(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if data.get("schema_version") != SCHEMA_VERSION:
        errors.append("schema_version 必须为 1")
    for field in ("project", "spec_hash"):
        if not isinstance(data.get(field), str) or not data[field].strip():
            errors.append(f"{field} 必须填写")
    items = data.get("items")
    if not isinstance(items, list):
        errors.append("items 必须是数组")
        return errors
    allowed_types = {"frame-comment", "feature-note", "review-comment", "change-request", "question"}
    allowed_status = {"unreviewed", "passed", "open", "in-progress", "pending-review", "resolved", "reopened", "not-applicable", "anchor-drift"}
    ids: set[str] = set()
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            errors.append(f"items[{index}] 必须是对象")
            continue
        feedback_id = item.get("feedback_id")
        if not isinstance(feedback_id, str) or not feedback_id:
            errors.append(f"items[{index}] 缺少 feedback_id")
        elif feedback_id in ids:
            errors.append(f"feedback_id 重复: {feedback_id}")
        else:
            ids.add(feedback_id)
        if item.get("feedback_type") not in allowed_types:
            errors.append(f"items[{index}] feedback_type 非法")
        if item.get("status") not in allowed_status:
            errors.append(f"items[{index}] status 非法")
        for field in ("page_id", "state_id", "comment"):
            if not isinstance(item.get(field), str):
                errors.append(f"items[{index}].{field} 必须是字符串")
    return errors


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(content, encoding="utf-8")
    temp.replace(path)


def esc(value: Any) -> str:
    return html.escape(str(value or ""), quote=True)


def frame_key(page_id: str, state_id: str) -> str:
    return f"{page_id}::{state_id}"


def flow_map(spec: dict[str, Any]) -> dict[str, list[str]]:
    mapping: dict[str, list[str]] = {}
    for flow in spec["flows"]:
        for step in flow["steps"]:
            key = frame_key(step["page_id"], step["state_id"])
            mapping.setdefault(key, []).append(flow["flow_id"])
    return mapping


def route_frame_map(spec: dict[str, Any]) -> dict[str, dict[str, str]]:
    mapping: dict[str, dict[str, str]] = {}
    for page in spec["pages"]:
        for state in page["states"]:
            route = state_route(page, state)
            if route:
                mapping[route] = {"page_id": page["page_id"], "state_id": state["state_id"]}
    return mapping


def state_route(page: dict[str, Any], state: dict[str, Any]) -> str:
    return str(state.get("route") or page.get("route") or "")


def render_flow_filters(spec: dict[str, Any]) -> str:
    buttons = ['<button class="flow-filter active" data-flow="all" aria-pressed="true">全部关键帧</button>']
    for flow in spec["flows"]:
        buttons.append(f'<button class="flow-filter" data-flow="{esc(flow["flow_id"])}" aria-pressed="false">{esc(flow["title"])}</button>')
    return "".join(buttons)


def wire_region_content(region: dict[str, Any]) -> str:
    kind = region.get("kind", "other")
    label = esc(region.get("label"))
    note = esc(region.get("note"))
    if kind == "header":
        return f'<div class="wire-appbar"><i></i><strong>{label}</strong><span></span><button>次要操作</button><button class="solid">主要操作</button></div>'
    if kind in {"sidebar", "list"}:
        rows = "".join(f'<li><span>{label if index == 0 else "列表项 " + str(index + 1)}</span><b>{note if index == 0 and note else ("当前" if index == 0 else "")}</b></li>' for index in range(4))
        return f'<strong class="wire-section-title">{label}</strong><ul class="wire-list">{rows}</ul>'
    if kind == "toolbar":
        action_keywords = ("批量", "送批", "重新批改", "拆分", "合并", "新增", "删除", "还原", "调整位置")
        if any(keyword in str(region.get("label")) for keyword in action_keywords):
            actions = [part.strip() for part in re.split(r"[/／]", str(region.get("label"))) if part.strip()]
            buttons = "".join(f'<button class="{"solid" if index == len(actions) - 1 else ""}">{esc(action)}</button>' for index, action in enumerate(actions))
            return f'<strong class="wire-section-title">页面操作</strong><div class="wire-toolbar wire-actions-only">{buttons}</div>'
        return f'<strong class="wire-section-title">{label}</strong><div class="wire-toolbar"><span class="wire-select">筛选项</span><span class="wire-input">搜索或输入</span><button>重置</button><button class="solid">查询</button></div>'
    if kind == "form":
        return f'<strong class="wire-section-title">{label}</strong><div class="wire-form"><label>字段名称<span>{note or "已填写内容"}</span></label><label>字段名称<span>输入内容</span></label><label>说明或规则<textarea></textarea></label><div><button>取消</button><button class="solid">保存</button></div></div>'
    if kind == "table":
        header = "".join(f"<b>字段 {index + 1}</b>" for index in range(5))
        rows = "".join('<div>' + "".join(f"<span>{'—' if col == 1 and row == 2 else '数据'}</span>" for col in range(5)) + "</div>" for row in range(4))
        return f'<strong class="wire-section-title">{label}</strong><div class="wire-table"><header>{header}</header>{rows}</div>'
    if kind == "media":
        return f'<strong class="wire-section-title">{label}</strong><div class="wire-media"><div class="paper-line wide"></div><div class="paper-line"></div><div class="paper-line short"></div><i class="region-a"></i><i class="region-b"></i><span>{note or "试题或作答切图"}</span></div>'
    if kind == "dialog":
        return f'<div class="wire-dialog"><strong>{label}</strong><p>{note or "请确认当前操作"}</p><div class="wire-progress"><i></i></div><div><button>取消</button><button class="solid">确认</button></div></div>'
    if kind == "feedback":
        return f'<div class="wire-feedback"><strong>{label}</strong><p>{note or "说明问题并提供下一步操作"}</p><button>处理问题</button></div>'
    if kind == "footer":
        return f'<div class="wire-footer"><span>{label}</span><button>取消</button><button class="solid">确认</button></div>'
    return f'<strong class="wire-section-title">{label}</strong><div class="wire-content"><b>关键信息</b><p>{note or "这里展示与当前任务直接相关的内容和状态。"}</p><div><span></span><span></span><span></span></div></div>'


def lowfi_frame(page: dict[str, Any], state: dict[str, Any], flows: list[str]) -> str:
    blocks: list[str] = []
    for region in state["layout"]:
        kind = esc(region.get("kind", "other"))
        span = max(1, min(12, int(region.get("span") or 12)))
        row_span = max(1, min(4, int(region.get("row_span") or 1)))
        target_attr = f' data-target-id="{esc(region.get("target_id"))}"' if region.get("target_id") else ""
        blocks.append(
            f'<div class="wire-block kind-{kind}" style="--span:{span};--row-span:{row_span}"{target_attr}>'
            f'{wire_region_content(region)}</div>'
        )
    key = frame_key(page["page_id"], state["state_id"])
    required = "true" if state.get("required", True) else "false"
    return f"""
    <article class="frame-card" data-frame="{esc(key)}" data-flows="{esc(' '.join(flows))}" data-required="{required}">
      <header class="frame-head"><div><span>{esc(page['title'])}</span><h2>{esc(state['title'])}</h2></div><b>{esc(state_kind_label(state.get('kind', 'default')))}</b></header>
      <p class="frame-desc">{esc(state.get('description') or page.get('summary'))}</p>
      <div class="frame-main">
        <div class="wire-canvas">{''.join(blocks)}</div>
        <div class="frame-review">
          <div class="frame-review-head"><strong>反馈记录</strong><span data-role="save-state">浏览器草稿</span></div>
          <label>确认状态<select data-role="status"><option value="unreviewed">未检查</option><option value="passed">方向正确</option><option value="open">有问题</option><option value="not-applicable">不适用</option></select></label>
          <label>意见<textarea data-role="comment" placeholder="写下这个页面或状态需要调整的地方"></textarea></label>
        </div>
      </div>
    </article>"""


def template_text(name: str) -> str:
    path = Path(__file__).resolve().parents[1] / "templates" / "prototype-collab" / name
    return path.read_text(encoding="utf-8")


def workbench_css(tokens: dict[str, str]) -> str:
    return visual_token_css(tokens) + "\n" + template_text("workbench.css")


def state_kind_label(kind: str) -> str:
    return {"default": "默认", "empty": "空状态", "loading": "处理中", "error": "异常", "success": "完成", "permission": "权限", "confirmation": "待确认"}.get(kind, kind)


def workbench_header(spec: dict[str, Any], stage: str, actions: str, review_ready: bool = True, visual_ready: bool = False) -> str:
    title = re.sub(r"\s*(?:Web\s*)?关键帧规格$", "", spec["title"]).strip()
    links = []
    for key, label, href, number in (("lowfi", "布局确认", "../lowfi/index.html", "01"), ("review", "逐页确认", "../review/index.html", "02")):
        current = ' aria-current="step"' if stage == key else ""
        if key == "review" and not review_ready:
            links.append(f'<span class="step" aria-disabled="true"><span class="step-number">{number}</span>{label}</span>')
        else:
            links.append(f'<a class="step" href="{href}"{current}><span class="step-number">{number}</span>{label}</a>')
    current = ' aria-current="step"' if stage == "visual" else ""
    final_step = f'<a class="step" href="../visual/index.html"{current}><span class="step-number">03</span>UI 稿</a>' if visual_ready else '<span class="step step-future"><span class="step-number">03</span>UI 稿 <small>后续阶段</small></span>'
    return f'''<header class="app-header"><div class="brand"><svg class="brand-symbol" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#000"/><path d="M8 9h16v5H8z" fill="#dceeb1"/><path d="M8 18h10v5H8z" fill="#c5b0f4"/></svg><span class="brand-name">原型工作台</span><span class="project-name" title="{esc(title)}">{esc(title)}</span></div><nav class="steps" aria-label="原型阶段">{''.join(links)}{final_step}</nav><div class="header-actions">{actions}</div></header>'''


def render_lowfi(spec: dict[str, Any], tokens: dict[str, str] | None = None, review_ready: bool = False, visual_ready: bool = False) -> str:
    tokens = tokens or load_visual_tokens()
    spec_hash = content_hash(spec)
    mapping = flow_map(spec)
    frames = []
    for page in spec["pages"]:
        for state in page["states"]:
            frames.append(lowfi_frame(page, state, mapping.get(frame_key(page["page_id"], state["state_id"]), [])))
    embedded = json.dumps(spec, ensure_ascii=False).replace("</", "<\\/")
    css = workbench_css(tokens) + "\n" + template_text("wireframe.css")
    script = r"""(()=>{'use strict';
const spec=JSON.parse(document.getElementById('aipm-spec').textContent);const specHash=document.body.dataset.specHash;const storageKey=`aipm:lowfi:${spec.project}:${specHash}`;let data={};try{data=JSON.parse(localStorage.getItem(storageKey)||'{}')}catch(e){data={}};
const cards=[...document.querySelectorAll('.frame-card')];function persist(){localStorage.setItem(storageKey,JSON.stringify(data));updateSummary()}function updateSummary(){const values=Object.values(data);const passed=values.filter(x=>x.status==='passed').length;const issues=values.filter(x=>x.status==='open').length;const percent=Math.round(passed/cards.length*100);document.getElementById('progressFill').style.width=percent+'%';document.querySelector('[role=progressbar]').setAttribute('aria-valuenow',percent);document.getElementById('progress').textContent=`${passed}/${cards.length} 已确认 · ${issues} 个有问题`}
cards.forEach(card=>{const key=card.dataset.frame;const saved=data[key]||{};const status=card.querySelector('[data-role=status]');const comment=card.querySelector('[data-role=comment]');const saveState=card.querySelector('[data-role=save-state]');status.value=saved.status||'unreviewed';comment.value=saved.comment||'';const markSaved=()=>{if(saveState)saveState.textContent='草稿已保存'};status.addEventListener('change',()=>{data[key]={...data[key],status:status.value,comment:comment.value,updated_at:new Date().toISOString()};persist();markSaved()});comment.addEventListener('input',()=>{data[key]={...data[key],status:status.value,comment:comment.value,updated_at:new Date().toISOString()};persist();markSaved()})});
function feedback(decision){const items=cards.map(card=>{const [page_id,state_id]=card.dataset.frame.split('::');const item=data[card.dataset.frame]||{};return{feedback_id:`lowfi-${page_id}-${state_id}`,feedback_type:'frame-comment',page_id,state_id,status:item.status||'unreviewed',comment:item.comment||'',category:'other',severity:item.status==='open'?'major':'info',updated_at:item.updated_at||new Date().toISOString()}}).filter(x=>x.status!=='unreviewed'||x.comment);return{schema_version:1,project:spec.project,spec_hash:specHash,stage:'lowfi',decision,exported_at:new Date().toISOString(),items}}
function download(name,payload){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}
async function sync(payload){try{const r=await fetch('/__aipm_feedback__',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});return r.ok}catch(e){return false}}document.getElementById('exportFeedback').addEventListener('click',async()=>{const payload=feedback('revise');const saved=await sync(payload);if(!saved)download('lowfi-feedback.json',payload);toast(saved?'意见已同步到项目 feedback/':'已下载意见 JSON')});document.getElementById('approve').addEventListener('click',async()=>{const missing=cards.filter(c=>c.dataset.required==='true'&&(data[c.dataset.frame]?.status||'unreviewed')==='unreviewed');if(missing.length){toast(`还有 ${missing.length} 个必看关键帧未确认`);missing[0].scrollIntoView({behavior:'smooth',block:'center'});missing[0].classList.add('is-active');return}const hasIssue=cards.some(c=>data[c.dataset.frame]?.status==='open');const payload=feedback(hasIssue?'revise':'approved');const saved=await sync(payload);if(!saved)download('lowfi-approval.json',payload);toast(saved?(hasIssue?'修改意见已同步':'确认结果已同步'):(hasIssue?'已导出修改意见':'已导出低保真确认结果'))});
document.querySelectorAll('.flow-filter').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.flow-filter').forEach(x=>(x.classList.toggle('active',x===btn),x.setAttribute('aria-pressed',String(x===btn))));cards.forEach(card=>card.hidden=btn.dataset.flow!=='all'&&!card.dataset.flows.split(' ').includes(btn.dataset.flow))}));function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.hidden=false;setTimeout(()=>el.hidden=true,2600)}updateSummary();})();
"""
    return f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>{esc(spec['title'])} · 线框关键帧</title><style>{css}</style></head><body class="workbench-lowfi" data-spec-hash="{spec_hash}">{workbench_header(spec, 'lowfi', '<button class="btn" id="exportFeedback">导出意见</button><button class="btn btn-primary" id="approve">提交布局确认</button>', review_ready, visual_ready)}<section class="summary"><div class="summary-line"><div><h1>先确认布局，再打磨细节</h1><p>逐帧查看页面结构，在右侧留下确认结果或修改意见。</p></div><div class="progress-block"><strong id="progress"></strong><div class="progress-track" role="progressbar" aria-label="布局确认进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="progressFill"></i></div></div></div><div class="summary-bottom"><span class="summary-note">所有关键帧均在本页展示</span><nav class="filters" aria-label="按流程筛选">{render_flow_filters(spec)}</nav></div></section><main class="gallery">{''.join(frames)}</main><div class="toast" id="toast" hidden></div><script type="application/json" id="aipm-spec">{embedded}</script><script>{script}</script></body></html>"""


def join_prototype_route(base: str, route: str) -> str:
    if not route:
        return base
    if route.startswith(("?", "#")):
        return base + route
    return route


def with_revision(src: str, revision: str) -> str:
    if not revision:
        return src
    parts = urlsplit(src)
    query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True) if key != "aipm_rev"]
    query.append(("aipm_rev", revision[:12]))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def review_frame(page: dict[str, Any], state: dict[str, Any], flows: list[str], prototype_src: str, prototype_hash: str = "") -> str:
    key = frame_key(page["page_id"], state["state_id"])
    src = with_revision(join_prototype_route(prototype_src, state_route(page, state)), prototype_hash)
    return f"""
    <article class="review-card" data-frame="{esc(key)}" data-flows="{esc(' '.join(flows))}">
      <header class="review-head"><div><span>{esc(page['title'])}</span><h2>{esc(state['title'])}</h2></div><a href="{esc(src)}" target="_blank" rel="noopener">打开交互页</a></header>
      <div class="review-body"><div class="prototype-frame"><iframe title="{esc(page['title'])} - {esc(state['title'])}" src="{esc(src)}" loading="lazy"></iframe></div><aside class="review-panel"><label>巡检结论<select data-role="status"><option value="unreviewed">未检查</option><option value="passed">通过</option><option value="open">有问题</option><option value="pending-review">待复核</option><option value="not-applicable">不适用</option></select></label><label>评论<textarea data-role="comment" placeholder="记录这个关键帧的问题或建议"></textarea></label><div class="annotation-count" data-role="annotation-count">页面标注 0 条</div></aside></div>
    </article>"""


def render_review(
    spec: dict[str, Any],
    prototype_src: str,
    prototype_hash: str,
    approval: dict[str, Any],
    tokens: dict[str, str] | None = None,
    visual_ready: bool = False,
) -> str:
    tokens = tokens or load_visual_tokens()
    verify_approval(spec, approval)
    spec_hash = content_hash(spec)
    mapping = flow_map(spec)
    frames: list[dict[str, Any]] = []
    nav_groups: list[str] = []
    frame_index = 0
    for page in spec["pages"]:
        buttons: list[str] = []
        for state in page["states"]:
            key = frame_key(page["page_id"], state["state_id"])
            src = with_revision(join_prototype_route(prototype_src, state_route(page, state)), prototype_hash)
            flows = mapping.get(key, [])
            frames.append({
                "key": key,
                "page_id": page["page_id"],
                "page_title": page["title"],
                "state_id": state["state_id"],
                "state_title": state["title"],
                "description": state.get("description") or page.get("summary") or "",
                "src": src,
                "flows": flows,
            })
            buttons.append(f'<button class="frame-nav-item" data-index="{frame_index}" data-flows="{esc(" ".join(flows))}"><i></i><span><b>{esc(state["title"])}</b><small>{esc(state_kind_label(state.get("kind", "default")))}</small></span></button>')
            frame_index += 1
        nav_groups.append(f'<section class="frame-nav-group"><h3>{esc(page["title"])}</h3>{"".join(buttons)}</section>')
    embedded = json.dumps(frames, ensure_ascii=False).replace("</", "<\\/")
    flow_options = ['<option value="all">全部流程</option>'] + [f'<option value="{esc(flow["flow_id"])}">{esc(flow["title"])}</option>' for flow in spec["flows"]]
    css = workbench_css(tokens)
    script = r"""(()=>{'use strict';
const frames=JSON.parse(document.getElementById('aipm-frames').textContent);const project=document.body.dataset.project;const specHash=document.body.dataset.specHash;const prototypeHash=document.body.dataset.prototypeHash;const storageKey=`aipm:review:${project}:${specHash}`;let data={};try{data=JSON.parse(localStorage.getItem(storageKey)||'{}')}catch(e){data={}}let current=0;let activeFlow='all';const nav=[...document.querySelectorAll('.frame-nav-item')];const status=document.getElementById('reviewStatus');const comment=document.getElementById('reviewComment');
const shellKey=`aipm:review-shell:${project}`;let shellState={navCollapsed:false,inspectorCollapsed:false};try{shellState={...shellState,...JSON.parse(localStorage.getItem(shellKey)||'{}')}}catch(e){}let frameTimer=0;const frameHost=document.getElementById('frameHost');const frameState=document.getElementById('frameState');const prototypeFrame=document.getElementById('prototypeFrame');function applyShell(){document.body.classList.toggle('nav-collapsed',!!shellState.navCollapsed);document.body.classList.toggle('inspector-collapsed',!!shellState.inspectorCollapsed);const navButton=document.getElementById('toggleNav');const inspectorButton=document.getElementById('toggleInspector');navButton.setAttribute('aria-expanded',String(!shellState.navCollapsed));navButton.setAttribute('aria-label',shellState.navCollapsed?'展开关键页面':'收起关键页面');navButton.title=navButton.getAttribute('aria-label');inspectorButton.setAttribute('aria-expanded',String(!shellState.inspectorCollapsed));inspectorButton.setAttribute('aria-label',shellState.inspectorCollapsed?'展开巡检记录':'收起巡检记录');inspectorButton.title=inspectorButton.getAttribute('aria-label')}function persistShell(){try{localStorage.setItem(shellKey,JSON.stringify(shellState))}catch(e){}applyShell()}document.getElementById('toggleNav').addEventListener('click',()=>{shellState.navCollapsed=!shellState.navCollapsed;persistShell()});document.getElementById('toggleInspector').addEventListener('click',()=>{shellState.inspectorCollapsed=!shellState.inspectorCollapsed;persistShell()});prototypeFrame.addEventListener('load',()=>{clearTimeout(frameTimer);frameHost.classList.add('frame-loaded');frameHost.classList.remove('frame-slow')});
function visibleIndices(){return frames.map((frame,index)=>({frame,index})).filter(({frame})=>activeFlow==='all'||frame.flows.includes(activeFlow)).map(({index})=>index)}function currentData(){return data[frames[current].key]||{status:'unreviewed',comment:''}}function persist(){try{localStorage.setItem(storageKey,JSON.stringify(data))}catch(e){}renderSummary()}function updateCurrent(){const frame=frames[current];data[frame.key]={...data[frame.key],status:status.value,comment:comment.value,updated_at:new Date().toISOString()};persist();updateNavState(current)}
function updateNavState(index){const frame=frames[index];const item=data[frame.key]||{};nav[index].className=`frame-nav-item ${index===current?'active':''} status-${item.status||'unreviewed'}`}
function selectFrame(index,pushHash=true){if(!frames[index])return;current=index;document.getElementById('annotationCount').textContent='页面标注 0 条';const frame=frames[index];document.getElementById('currentPage').textContent=frame.page_title;document.getElementById('currentTitle').textContent=frame.state_title;document.getElementById('currentDescription').textContent=frame.description;document.getElementById('frameCounter').textContent=`${index+1} / ${frames.length}`;frameHost.classList.remove('frame-loaded','frame-slow');frameState.innerHTML='<div><strong>正在加载页面</strong><span>请稍候</span></div>';clearTimeout(frameTimer);frameTimer=setTimeout(()=>{frameHost.classList.add('frame-slow');frameState.innerHTML='<div><strong>页面加载时间较长</strong><span>可以使用上方“独立打开”继续查看</span></div>'},8000);prototypeFrame.src=frame.src;prototypeFrame.title=`${frame.page_title} - ${frame.state_title}`;document.getElementById('openInteractive').href=frame.src;const saved=currentData();status.value=saved.status||'unreviewed';comment.value=saved.comment||'';nav.forEach((_,navIndex)=>updateNavState(navIndex));if(pushHash)history.replaceState(null,'',`#frame=${encodeURIComponent(frame.key)}`)}
function move(delta){const visible=visibleIndices();const position=visible.indexOf(current);const next=visible[(position+delta+visible.length)%visible.length];if(next!==undefined)selectFrame(next)}nav.forEach((button,index)=>button.addEventListener('click',()=>selectFrame(index)));status.addEventListener('change',updateCurrent);comment.addEventListener('input',updateCurrent);document.getElementById('prevFrame').addEventListener('click',()=>move(-1));document.getElementById('nextFrame').addEventListener('click',()=>move(1));document.getElementById('flowSelect').addEventListener('change',event=>{activeFlow=event.target.value;nav.forEach((button,index)=>button.hidden=activeFlow!=='all'&&!frames[index].flows.includes(activeFlow));document.querySelectorAll('.frame-nav-group').forEach(group=>group.hidden=![...group.querySelectorAll('.frame-nav-item')].some(button=>!button.hidden));const visible=visibleIndices();if(!visible.includes(current)&&visible.length)selectFrame(visible[0])});
function payload(){const items=frames.map(frame=>{const item=data[frame.key]||{};return{feedback_id:`review-${frame.page_id}-${frame.state_id}`,feedback_type:'review-comment',page_id:frame.page_id,state_id:frame.state_id,status:item.status||'unreviewed',comment:item.comment||'',category:'other',severity:item.status==='open'?'major':'info',updated_at:item.updated_at||new Date().toISOString()}}).filter(item=>item.status!=='unreviewed'||item.comment);return{schema_version:1,project,spec_hash:specHash,prototype_hash:prototypeHash,stage:'highfi-review',exported_at:new Date().toISOString(),items}}function download(value){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));a.download='review-feedback.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}async function sync(){const value=payload();try{const response=await fetch('/__aipm_feedback__',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});if(response.ok){showSaved();return}}catch(e){}download(value)}document.getElementById('exportFeedback').addEventListener('click',sync);document.getElementById('saveFrame').addEventListener('click',async()=>{updateCurrent();await sync()});function showSaved(){const button=document.getElementById('saveFrame');const previous=button.textContent;button.textContent='已保存';setTimeout(()=>button.textContent=previous,1600)}function renderSummary(){const values=Object.values(data);const percent=Math.round(values.filter(item=>item.status==='passed').length/frames.length*100);document.getElementById('progressFill').style.width=percent+'%';document.querySelector('[role=progressbar]').setAttribute('aria-valuenow',percent);document.getElementById('progress').textContent=`${values.filter(item=>item.status==='passed').length}/${frames.length} 已通过 · ${values.filter(item=>item.status==='open').length} 个有问题`}
window.addEventListener('message',event=>{if(event.source!==prototypeFrame.contentWindow||!event.data||event.data.type!=='aipm:annotations-changed')return;if(event.data.frame===frames[current].key)document.getElementById('annotationCount').textContent=`页面标注 ${event.data.count} 条`});document.addEventListener('keydown',event=>{if(event.altKey&&event.key==='ArrowLeft')move(-1);if(event.altKey&&event.key==='ArrowRight')move(1)});const requested=decodeURIComponent((location.hash.match(/frame=([^&]+)/)||[])[1]||'');const initial=frames.findIndex(frame=>frame.key===requested);applyShell();selectFrame(initial>=0?initial:0,false);renderSummary();})();
"""
    return f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>{esc(spec['title'])} · 原型巡检</title><style>{css}</style></head><body class="workbench-review" data-project="{esc(spec['project'])}" data-spec-hash="{spec_hash}" data-prototype-hash="{esc(prototype_hash)}">{workbench_header(spec, 'review', '<button class="btn btn-primary" id="exportFeedback">提交全部意见</button>', visual_ready=visual_ready)}<main class="review-shell"><aside class="review-nav" id="reviewNav"><div class="nav-toolbar"><div class="nav-toolbar-head"><strong>关键页面</strong><button class="collapse-btn" id="toggleNav" type="button" aria-controls="reviewNav" aria-expanded="true" aria-label="收起关键页面"><i class="collapse-mark" aria-hidden="true"></i></button></div><label>查看范围<select id="flowSelect">{''.join(flow_options)}</select></label></div><nav>{''.join(nav_groups)}</nav></aside><section class="review-stage"><header class="stage-head"><div><span id="currentPage"></span><h2 id="currentTitle"></h2><p id="currentDescription"></p></div><div class="stage-actions"><button class="btn" id="prevFrame">上一页</button><button class="btn" id="nextFrame">下一页</button><a class="btn" id="openInteractive" target="_blank" rel="noopener">独立打开</a></div></header><div class="prototype-frame" id="frameHost"><div class="frame-state" id="frameState" role="status"><div><strong>正在加载页面</strong><span>请稍候</span></div></div><iframe id="prototypeFrame" title="正在加载原型"></iframe></div></section><aside class="review-inspector" id="reviewInspector"><div class="inspector-head"><strong>页面确认</strong><span id="frameCounter"></span><button class="collapse-btn" id="toggleInspector" type="button" aria-controls="reviewInspector" aria-expanded="true" aria-label="收起巡检记录"><i class="collapse-mark" aria-hidden="true"></i></button></div><label>当前结论<select id="reviewStatus"><option value="unreviewed">未检查</option><option value="passed">通过</option><option value="open">有问题</option><option value="pending-review">待复核</option><option value="not-applicable">不适用</option></select></label><label>页面评论<textarea id="reviewComment" placeholder="记录当前页面的问题、建议或确认结论"></textarea></label><div class="annotation-guide"><div class="annotation-count" id="annotationCount">页面标注 0 条</div><p class="inspector-help">从左侧切换关键页面。需要说明具体位置时，点击原型右下角“添加标签”。</p></div><div class="review-progress"><strong id="progress"></strong><div class="progress-track" role="progressbar" aria-label="逐页确认进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="progressFill"></i></div></div><div class="inspector-actions"><button class="btn" id="saveFrame">保存当前页意见</button><small>编辑自动存为浏览器草稿</small></div></aside></main><script type="application/json" id="aipm-frames">{embedded}</script><script>{script}</script></body></html>"""


def annotation_runtime(tokens: dict[str, str] | None = None) -> str:
    tokens = tokens or load_visual_tokens()
    runtime = template_text("annotation-runtime.js")
    # Keep variables inside the shadow tree. No workbench rule enters product CSS.
    style = visual_token_css(tokens).replace(":root{", ":host{") + template_text("annotation.css")
    return runtime.replace("/* AIPM_ANNOTATION_STYLE */", style, 1)


def instrument_html(spec: dict[str, Any], html_path: Path, runtime_path: Path) -> str:
    source = html_path.read_text(encoding="utf-8")
    if "</body>" not in source.lower():
        raise SpecError(f"HTML 缺少 </body>: {html_path}")
    rel = os.path.relpath(runtime_path, html_path.parent).replace(os.sep, "/")
    runtime_hash = hashlib.sha256(runtime_path.read_bytes()).hexdigest()[:12] if runtime_path.exists() else "missing"
    runtime_src = f"{rel}?v={runtime_hash}"
    routes = canonical_json(route_frame_map(spec))
    tag = (
        f'<script src="{html.escape(runtime_src, quote=True)}" {ANNOTATION_MARKER}="1" '
        f'data-aipm-project="{html.escape(spec["project"], quote=True)}" '
        f'data-aipm-spec-hash="{content_hash(spec)}" '
        f'data-aipm-route-map="{html.escape(routes, quote=True)}"></script>'
    )
    if ANNOTATION_MARKER in source:
        pattern = re.compile(r'<script\b[^>]*\bdata-aipm-annotation-runtime="1"[^>]*></script>')
        match = pattern.search(source)
        if not match:
            raise SpecError("检测到标注标记，但无法定位标注 script 标签")
        if match.group(0) == tag:
            return "already-instrumented"
        write_text(html_path, source[:match.start()] + tag + source[match.end():])
        return "updated"
    index = source.lower().rfind("</body>")
    patched = source[:index] + tag + "\n" + source[index:]
    backup = html_path.with_suffix(html_path.suffix + ".pre-annotation.bak")
    if not backup.exists():
        shutil.copy2(html_path, backup)
    write_text(html_path, patched)
    return "instrumented"


def summarize_feedback(data: dict[str, Any]) -> str:
    items = data.get("items") or []
    open_items = [item for item in items if item.get("status") not in {"passed", "resolved", "not-applicable"}]
    groups: dict[str, list[dict[str, Any]]] = {}
    for item in open_items:
        key = f"{item.get('page_id', 'unknown')}/{item.get('state_id', 'default')}"
        groups.setdefault(key, []).append(item)
    lines = ["# 原型反馈修改预览", "", f"- 项目：{data.get('project', '—')}", f"- 开放反馈：{len(open_items)} 条", ""]
    for key, group in groups.items():
        lines.append(f"## {key}")
        lines.append("")
        for item in group:
            target = item.get("target_id") or (item.get("anchor") or {}).get("stable_id") or "整帧"
            label = {"feature-note": "功能说明", "change-request": "修改意见", "question": "问题"}.get(item.get("feedback_type"), "评审评论")
            lines.append(f"- **{label} · {target}**：{item.get('comment', '').strip() or '—'}")
            if item.get("expected"):
                lines.append(f"  期望：{item['expected'].strip()}")
            if item.get("doc_refs"):
                lines.append(f"  关联：{'；'.join(item['doc_refs'])}")
            for reply in item.get("replies") or []:
                lines.append(f"  回复（{reply.get('author') or '评审者'}）：{str(reply.get('text') or '').strip()}")
        lines.append("")
    lines.extend(["> 本文件只生成修改预览；必须由用户确认后才能修改原型。", ""])
    return "\n".join(lines)


def command_validate(args: argparse.Namespace) -> int:
    data = load_json(Path(args.path))
    errors = validate_feedback(data) if args.kind == "feedback" else validate_spec(data)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print(f"PASS: {args.kind} valid · hash={content_hash(data)[:12]}")
    return 0


def generated_stage_ready(out: Path, stage: str, spec: dict[str, Any]) -> bool:
    target = out.parent.parent / stage / "index.html"
    return target.is_file() and f'data-spec-hash="{content_hash(spec)}"' in target.read_text(encoding="utf-8")


def command_render_lowfi(args: argparse.Namespace) -> int:
    spec = load_json(Path(args.spec))
    errors = validate_spec(spec)
    if errors:
        raise SpecError("；".join(errors))
    out = Path(args.out)
    tokens = load_visual_tokens(Path(args.tokens) if args.tokens else None)
    write_text(out, render_lowfi(spec, tokens, generated_stage_ready(out, "review", spec), generated_stage_ready(out, "visual", spec)))
    print(f"LOWFI: {out}")
    print(f"SPEC_HASH: {content_hash(spec)}")
    return 0


def command_render_review(args: argparse.Namespace) -> int:
    spec_path = Path(args.spec)
    spec = load_json(spec_path)
    errors = validate_spec(spec)
    if errors:
        raise SpecError("；".join(errors))
    approval = load_json(Path(args.approval))
    decision = verify_approval(spec, approval)
    out = Path(args.out)
    prototype = Path(args.prototype).resolve()
    prototype_src = os.path.relpath(prototype, out.parent.resolve()).replace(os.sep, "/")
    prototype_hash = hashlib.sha256(prototype.read_bytes()).hexdigest() if prototype.exists() else "missing"
    tokens = load_visual_tokens(Path(args.tokens) if args.tokens else None)
    write_text(out, render_review(spec, prototype_src, prototype_hash, approval, tokens, generated_stage_ready(out, "visual", spec)))
    print(f"REVIEW: {out}")
    print(f"PROTOTYPE_HASH: {prototype_hash}")
    print(f"LOWFI_APPROVAL: {decision} · spec_hash={content_hash(spec)}")
    return 0


def command_check_html(args: argparse.Namespace) -> int:
    path = Path(args.html)
    errors = validate_html_file(path)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print(f"PASS: HTML resources and IDs valid · {path}")
    return 0


def command_emit_runtime(args: argparse.Namespace) -> int:
    out = Path(args.out)
    tokens = load_visual_tokens(Path(args.tokens) if args.tokens else None)
    write_text(out, annotation_runtime(tokens))
    print(f"RUNTIME: {out}")
    return 0


def command_instrument(args: argparse.Namespace) -> int:
    spec = load_json(Path(args.spec))
    errors = validate_spec(spec)
    if errors:
        raise SpecError("；".join(errors))
    html_path = Path(args.html)
    runtime_path = Path(args.runtime) if args.runtime else html_path.parent / "runtime" / "annotation-runtime.js"
    tokens = load_visual_tokens(Path(args.tokens) if args.tokens else None)
    write_text(runtime_path, annotation_runtime(tokens))
    result = instrument_html(spec, html_path, runtime_path)
    html_errors = validate_html_file(html_path)
    if html_errors:
        raise SpecError("；".join(html_errors))
    print(f"INSTRUMENT: {result} · {html_path}")
    print(f"RUNTIME: {runtime_path}")
    return 0


def command_summarize(args: argparse.Namespace) -> int:
    data = load_json(Path(args.feedback))
    errors = validate_feedback(data)
    if errors:
        raise SpecError("；".join(errors))
    output = summarize_feedback(data)
    if args.out:
        write_text(Path(args.out), output)
        print(f"PREVIEW: {args.out}")
    else:
        print(output)
    return 0


def command_scan_source(args: argparse.Namespace) -> int:
    report = scan_source_tree(Path(args.source))
    if args.out:
        write_text(Path(args.out), json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        print(f"SOURCE_MANIFEST: {args.out}")
    else:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


def command_emit_tokens(args: argparse.Namespace) -> int:
    output = {
        "schema_version": 1,
        "name": "editorial-workbench",
        "tokens": dict(DEFAULT_VISUAL_TOKENS),
    }
    write_text(Path(args.out), json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(f"TOKENS: {args.out}")
    return 0


def command_diff_prototype(args: argparse.Namespace) -> int:
    report = prototype_diff(Path(args.old), Path(args.new))
    output = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.out:
        write_text(Path(args.out), output)
        print(f"PROTOTYPE_DIFF: {args.out}")
    else:
        print(output, end="")
    return 0


def validate_screenshot_manifest(path: Path) -> list[str]:
    if not path.is_file():
        return [f"截图 manifest 不存在: {path}"]
    try:
        data = load_json(path)
    except SpecError as exc:
        return [str(exc)]
    errors: list[str] = []
    for index, section in enumerate(data.get("sections") or []):
        if not isinstance(section, dict):
            errors.append(f"manifest.sections[{index}] 必须是对象")
            continue
        screenshot = section.get("screenshot")
        expected = section.get("sha256")
        if not isinstance(screenshot, str) or not screenshot:
            errors.append(f"manifest.sections[{index}] 缺少 screenshot")
            continue
        target = (path.parent / screenshot).resolve()
        if not target.is_file():
            errors.append(f"截图不存在: {screenshot}")
            continue
        if isinstance(expected, str) and expected:
            actual = hashlib.sha256(target.read_bytes()).hexdigest()
            if actual.casefold() != expected.casefold():
                errors.append(f"截图 hash 不匹配: {screenshot}")
    return errors


def command_accept(args: argparse.Namespace) -> int:
    errors: list[str] = []
    warnings: list[str] = []
    spec_path = Path(args.spec)
    try:
        spec = load_json(spec_path)
        errors.extend(validate_spec(spec))
        if not errors:
            approval = load_json(Path(args.approval))
            verify_approval(spec, approval)
    except SpecError as exc:
        errors.append(str(exc))
    for label, value in (("prototype", args.prototype), ("review", args.review), ("lowfi", args.lowfi)):
        if value:
            errors.extend(f"{label}: {error}" for error in validate_html_file(Path(value)))
    if args.tokens:
        try:
            load_visual_tokens(Path(args.tokens))
        except SpecError as exc:
            errors.append(f"tokens: {exc}")
    if args.manifest:
        errors.extend(validate_screenshot_manifest(Path(args.manifest)))
    if args.feedback_dir:
        feedback_dir = Path(args.feedback_dir)
        for name in ("lowfi-approval.json", "review-feedback.json", "annotations.json"):
            path = feedback_dir / name
            if path.is_file():
                try:
                    feedback = load_json(path)
                    errors.extend(f"{name}: {error}" for error in validate_feedback(feedback))
                except SpecError as exc:
                    errors.append(f"{name}: {exc}")
    if args.browser_report:
        try:
            report = load_json(Path(args.browser_report))
            for key in ("console_errors", "page_errors"):
                values = report.get(key, [])
                if values:
                    errors.append(f"browser_report.{key} 非空")
        except SpecError as exc:
            errors.append(f"browser_report: {exc}")
    else:
        warnings.append("未提供 browser_report：仅完成静态验收，未替代浏览器视觉核对")
    result = {"schema_version": 1, "status": "passed" if not errors else "blocked", "errors": errors, "warnings": warnings}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if not errors else 1


def feedback_filename(data: dict[str, Any]) -> str:
    stage = data.get("stage")
    if stage == "lowfi":
        return "lowfi-approval.json" if data.get("decision") in {"approved", "skipped"} else "lowfi-feedback.json"
    if stage == "highfi-review":
        return "review-feedback.json"
    if stage == "annotation":
        return "annotations.json"
    raise SpecError(f"未知 feedback stage: {stage}")


def serve_project(root: Path, host: str, port: int) -> None:
    root = root.resolve()
    feedback_dir = root / "feedback"
    feedback_dir.mkdir(parents=True, exist_ok=True)

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *handler_args: Any, **handler_kwargs: Any) -> None:
            super().__init__(*handler_args, directory=str(root), **handler_kwargs)

        def do_POST(self) -> None:  # noqa: N802 - stdlib handler API
            if self.path != "/__aipm_feedback__":
                self.send_error(404)
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > 2_000_000:
                    raise SpecError("反馈文件大小非法")
                data = json.loads(self.rfile.read(length).decode("utf-8"))
                if not isinstance(data, dict):
                    raise SpecError("反馈根节点必须是对象")
                errors = validate_feedback(data)
                if errors:
                    raise SpecError("；".join(errors))
                filename = feedback_filename(data)
                write_text(feedback_dir / filename, json.dumps(data, ensure_ascii=False, indent=2) + "\n")
                payload = json.dumps({"ok": True, "path": f"feedback/{filename}"}, ensure_ascii=False).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            except (SpecError, json.JSONDecodeError, UnicodeDecodeError) as exc:
                payload = json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False).encode("utf-8")
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

        def log_message(self, format_string: str, *values: Any) -> None:
            print(f"[prototype-review] {format_string % values}")

    server = ThreadingHTTPServer((host, port), Handler)
    print(f"ROOT: {root}")
    print(f"LOWFI: http://{host}:{port}/lowfi/index.html")
    print(f"HIGHFI: http://{host}:{port}/index.html")
    print(f"REVIEW: http://{host}:{port}/review/index.html")
    print(f"FEEDBACK: {feedback_dir}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def verify_approval(spec: dict[str, Any], approval: dict[str, Any], allow_skipped: bool = False) -> str:
    expected_hash = content_hash(spec)
    if approval.get("spec_hash") != expected_hash:
        raise SpecError("低保真确认已失效：approval spec_hash 与当前规格不一致")
    decision = approval.get("decision")
    if decision == "approved":
        return "approved"
    if decision == "skipped" and allow_skipped and approval.get("skip_reason"):
        return "skipped"
    raise SpecError(f"低保真尚未确认：decision={decision or 'missing'}")


def command_verify_approval(args: argparse.Namespace) -> int:
    spec = load_json(Path(args.spec))
    errors = validate_spec(spec)
    if errors:
        raise SpecError("；".join(errors))
    approval = load_json(Path(args.approval))
    decision = verify_approval(spec, approval, args.allow_skipped)
    print(f"PASS: lowfi {decision} · spec_hash={content_hash(spec)}")
    return 0


def command_serve(args: argparse.Namespace) -> int:
    serve_project(Path(args.root), args.host, args.port)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AI_PM 原型协作闭环工具")
    sub = parser.add_subparsers(dest="command", required=True)
    validate = sub.add_parser("validate", help="校验 prototype spec 或 feedback")
    validate.add_argument("--kind", choices=("spec", "feedback"), default="spec")
    validate.add_argument("path")
    validate.set_defaults(func=command_validate)
    lowfi = sub.add_parser("render-lowfi", help="生成低保真关键帧画廊")
    lowfi.add_argument("--spec", required=True)
    lowfi.add_argument("--out", required=True)
    lowfi.add_argument("--tokens", help="工作台视觉 Token JSON；缺省使用通用 DESIGN.md 配套 Token")
    lowfi.set_defaults(func=command_render_lowfi)
    review = sub.add_parser("render-review", help="生成精细原型巡检画廊（必须先通过低保真确认门）")
    review.add_argument("--spec", required=True)
    review.add_argument("--prototype", required=True)
    review.add_argument("--approval", required=True, help="用户导出的 lowfi-approval.json")
    review.add_argument("--tokens", help="工作台视觉 Token JSON；缺省使用通用 DESIGN.md 配套 Token")
    review.add_argument("--out", required=True)
    review.set_defaults(func=command_render_review)
    check_html = sub.add_parser("check-html", help="检查原型 HTML 的资源路径和重复 ID")
    check_html.add_argument("--html", required=True)
    check_html.set_defaults(func=command_check_html)
    runtime = sub.add_parser("emit-runtime", help="生成标注运行时")
    runtime.add_argument("--out", required=True)
    runtime.add_argument("--tokens", help="工作台视觉 Token JSON；缺省使用通用 DESIGN.md 配套 Token")
    runtime.set_defaults(func=command_emit_runtime)
    instrument = sub.add_parser("instrument", help="向原型 HTML 注入标注运行时")
    instrument.add_argument("--spec", required=True)
    instrument.add_argument("--html", required=True)
    instrument.add_argument("--runtime")
    instrument.add_argument("--tokens", help="工作台视觉 Token JSON；缺省使用通用 DESIGN.md 配套 Token")
    instrument.set_defaults(func=command_instrument)
    summarize = sub.add_parser("summarize-feedback", help="把反馈 JSON 转为 AI 修改预览")
    summarize.add_argument("--feedback", required=True)
    summarize.add_argument("--out")
    summarize.set_defaults(func=command_summarize)
    preview = sub.add_parser("modification-preview", help="把标签和巡检反馈转为修改预览")
    preview.add_argument("--feedback", required=True)
    preview.add_argument("--out")
    preview.set_defaults(func=command_summarize)
    source = sub.add_parser("scan-source", help="扫描代码仓或资料目录并生成来源证据 manifest")
    source.add_argument("--source", required=True)
    source.add_argument("--out")
    source.set_defaults(func=command_scan_source)
    tokens = sub.add_parser("emit-tokens", help="生成项目级视觉 Token JSON")
    tokens.add_argument("--out", required=True)
    tokens.set_defaults(func=command_emit_tokens)
    diff = sub.add_parser("diff-prototype", help="比较两版原型的 HTML 结构和稳定元素")
    diff.add_argument("--old", required=True)
    diff.add_argument("--new", required=True)
    diff.add_argument("--out")
    diff.set_defaults(func=command_diff_prototype)
    accept = sub.add_parser("accept", help="统一执行原型静态验收与证据对账")
    accept.add_argument("--spec", required=True)
    accept.add_argument("--approval", required=True)
    accept.add_argument("--prototype", required=True)
    accept.add_argument("--review", required=True)
    accept.add_argument("--lowfi")
    accept.add_argument("--tokens")
    accept.add_argument("--manifest")
    accept.add_argument("--feedback-dir")
    accept.add_argument("--browser-report")
    accept.set_defaults(func=command_accept)
    approval = sub.add_parser("verify-approval", help="验证低保真确认与当前规格 hash 一致")
    approval.add_argument("--spec", required=True)
    approval.add_argument("--approval", required=True)
    approval.add_argument("--allow-skipped", action="store_true")
    approval.set_defaults(func=command_verify_approval)
    serve = sub.add_parser("serve", help="启动本地原型巡检服务并把反馈写入项目 feedback/")
    serve.add_argument("--root", required=True, help="06-prototype 目录")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8765)
    serve.set_defaults(func=command_serve)
    return parser


def main() -> int:
    try:
        args = build_parser().parse_args()
        return int(args.func(args))
    except SpecError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
