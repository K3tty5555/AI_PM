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
    buttons = ['<button class="flow-filter active" data-flow="all">全部关键帧</button>']
    for flow in spec["flows"]:
        buttons.append(f'<button class="flow-filter" data-flow="{esc(flow["flow_id"])}">{esc(flow["title"])}</button>')
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
      <header class="frame-head"><div><span>{esc(page['title'])}</span><h2>{esc(state['title'])}</h2></div><b>{esc(state.get('kind', 'default'))}</b></header>
      <p class="frame-desc">{esc(state.get('description') or page.get('summary'))}</p>
      <div class="wire-canvas">{''.join(blocks)}</div>
      <div class="frame-review">
        <label>确认状态<select data-role="status"><option value="unreviewed">未检查</option><option value="passed">方向正确</option><option value="open">有问题</option><option value="not-applicable">不适用</option></select></label>
        <label>意见<textarea data-role="comment" placeholder="写下这个页面或状态需要调整的地方"></textarea></label>
      </div>
    </article>"""


COMMON_CSS = r"""
*{box-sizing:border-box;letter-spacing:0}html{color:#23272d;background:#f3f4f5;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}body{margin:0}button,select,textarea{font:inherit}button{cursor:pointer}button:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid rgba(15,118,110,.22);outline-offset:2px}.app-header{position:sticky;z-index:20;top:0;display:flex;align-items:center;gap:16px;min-height:64px;padding:10px 24px;color:#fff;background:#273b43;border-bottom:1px solid #172b32}.app-header h1{margin:0;font-size:20px}.app-header p{margin:2px 0 0;color:#cdd9dd;font-size:12px}.header-actions{margin-left:auto;display:flex;gap:8px}.btn{min-height:36px;padding:6px 14px;border:1px solid #cbd2d6;border-radius:5px;color:#3e474e;background:#fff}.btn-primary{color:#fff;border-color:#0f766e;background:#0f766e}.summary{display:flex;align-items:center;gap:14px;padding:12px 24px;background:#fff;border-bottom:1px solid #dfe3e6}.summary strong{font-variant-numeric:tabular-nums}.filters{margin-left:auto;display:flex;gap:6px;overflow:auto}.flow-filter{min-height:32px;padding:4px 11px;white-space:nowrap;border:1px solid #d5dadd;border-radius:4px;color:#56616a;background:#fff}.flow-filter.active{color:#0f766e;border-color:#0f766e;background:#edf8f6}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(430px,1fr));gap:18px;padding:20px 24px 48px;align-items:start}.frame-card{min-width:0;overflow:hidden;border:1px solid #d9dee1;border-radius:7px;background:#fff;box-shadow:0 5px 18px rgba(25,40,48,.07)}.frame-card.is-active{box-shadow:0 0 0 3px rgba(15,118,110,.22),0 8px 24px rgba(25,40,48,.12)}.frame-head{display:flex;align-items:center;gap:12px;padding:13px 15px;border-bottom:1px solid #e7eaec}.frame-head span{color:#7b858d;font-size:12px}.frame-head h2{margin:1px 0 0;font-size:16px}.frame-head b{margin-left:auto;padding:3px 8px;border-radius:10px;color:#5c6870;background:#eef1f2;font-size:12px}.frame-desc{min-height:42px;margin:0;padding:9px 15px;color:#68737b;font-size:12px}.frame-review{display:grid;grid-template-columns:150px minmax(0,1fr);gap:10px;padding:13px 15px;border-top:1px solid #e7eaec;background:#fafbfb}.frame-review label{display:grid;gap:5px;color:#5e6870;font-size:12px}.frame-review select,.frame-review textarea{width:100%;border:1px solid #cfd5d9;border-radius:4px;background:#fff}.frame-review select{height:36px;padding:0 8px}.frame-review textarea{min-height:70px;padding:8px;resize:vertical}.toast{position:fixed;z-index:100;right:22px;bottom:22px;max-width:360px;padding:10px 14px;border:1px solid #b7d8d2;border-radius:5px;background:#fff;box-shadow:0 10px 30px rgba(25,40,48,.2)}@media(max-width:820px){.app-header{align-items:flex-start;flex-wrap:wrap}.header-actions{margin-left:0}.summary{align-items:flex-start;flex-direction:column}.filters{width:100%;margin-left:0}.gallery{grid-template-columns:1fr;padding:14px}.frame-review{grid-template-columns:1fr}}
"""


def render_lowfi(spec: dict[str, Any]) -> str:
    spec_hash = content_hash(spec)
    mapping = flow_map(spec)
    frames = []
    for page in spec["pages"]:
        for state in page["states"]:
            frames.append(lowfi_frame(page, state, mapping.get(frame_key(page["page_id"], state["state_id"]), [])))
    embedded = json.dumps(spec, ensure_ascii=False).replace("</", "<\\/")
    css = COMMON_CSS + r"""
.gallery{grid-template-columns:repeat(auto-fit,minmax(720px,1fr))}.wire-canvas{display:grid;grid-template-columns:repeat(12,1fr);gap:8px;min-height:430px;margin:0 15px 15px;padding:12px;border:1px solid #bcc4c9;background:#eef0f1}.wire-block{grid-column:span var(--span);grid-row:span var(--row-span);min-width:0;min-height:74px;padding:10px;border:1px solid #b7bfc4;border-radius:3px;background:#fff}.kind-sidebar,.kind-list,.kind-media,.kind-form,.kind-table,.kind-content{min-height:286px}.kind-header,.kind-toolbar,.kind-footer{min-height:64px;background:#f6f7f7}.kind-dialog{display:grid;min-height:286px;place-items:center;background:#e4e7e8}.kind-feedback{display:grid;min-height:116px;place-items:center;border-color:#c99a52;background:#fff9ed}.wire-section-title{display:block;margin-bottom:10px;color:#343d44;font-size:12px}.wire-appbar{display:flex;align-items:center;gap:8px;height:100%}.wire-appbar i{width:26px;height:26px;border-radius:4px;background:#4f5d65}.wire-appbar strong{font-size:13px}.wire-appbar span{flex:1}.wire-block button{min-height:28px;padding:4px 9px;border:1px solid #adb7bd;border-radius:3px;color:#4a555c;background:#fff}.wire-block button.solid{color:#fff;border-color:#63747d;background:#63747d}.wire-list{display:grid;gap:6px;margin:0;padding:0;list-style:none}.wire-list li{display:flex;align-items:center;min-height:42px;padding:7px 8px;border:1px solid #d2d7da;border-radius:3px}.wire-list li:first-child{border-color:#6f827b;background:#eef3f1}.wire-list li span{font-size:11px}.wire-list li b{margin-left:auto;color:#61736d;font-size:10px}.wire-toolbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.wire-actions-only{justify-content:flex-end}.wire-select,.wire-input{display:flex;align-items:center;min-height:30px;padding:0 9px;border:1px solid #bfc7cc;border-radius:3px;color:#717b82;font-size:11px}.wire-input{flex:1;min-width:120px}.wire-form{display:grid;gap:9px}.wire-form label{display:grid;grid-template-columns:82px 1fr;align-items:center;gap:8px;color:#5c676e;font-size:11px}.wire-form label>span,.wire-form textarea{min-height:30px;padding:6px 8px;border:1px solid #c2c9cd;border-radius:3px;color:#4e5960;background:#fafbfb}.wire-form textarea{height:58px;resize:none}.wire-form>div{display:flex;justify-content:flex-end;gap:6px}.wire-table{border:1px solid #cbd1d4}.wire-table header,.wire-table>div{display:grid;grid-template-columns:1.4fr repeat(4,1fr)}.wire-table header{min-height:32px;background:#e7eaec}.wire-table b,.wire-table span{display:flex;align-items:center;padding:5px 7px;border-right:1px solid #d4d9dc;font-size:10px}.wire-table>div{min-height:38px;border-top:1px solid #dde1e3}.wire-media{position:relative;min-height:224px;overflow:hidden;border:1px solid #c8ced2;background:#f8f8f7}.wire-media>span{position:absolute;right:8px;bottom:6px;color:#7d868c;font-size:10px}.paper-line{height:7px;margin:28px 15% 0;background:#cbd0d3}.paper-line.wide{width:67%;margin-top:38px}.paper-line.short{width:42%}.wire-media i{position:absolute;border:2px solid #7a8c85;background:rgba(100,120,112,.08)}.region-a{top:84px;left:18%;width:33%;height:52px}.region-b{top:155px;left:49%;width:31%;height:42px}.wire-dialog{width:min(78%,440px);padding:18px;border:1px solid #abb5bb;border-radius:4px;background:#fff;box-shadow:0 8px 20px rgba(30,42,48,.12)}.wire-dialog p{color:#68737a;font-size:11px}.wire-dialog>div:last-child{display:flex;justify-content:flex-end;gap:6px}.wire-progress{height:7px;margin:18px 0;background:#e1e5e7}.wire-progress i{display:block;width:62%;height:100%;background:#71847d}.wire-feedback{width:100%;padding:14px}.wire-feedback p{margin:5px 0 12px;color:#715f43;font-size:11px}.wire-footer{display:flex;align-items:center;gap:7px;height:100%}.wire-footer span{flex:1;color:#5f6a71;font-size:11px}.wire-content p{color:#68737a;font-size:11px}.wire-content>div{display:grid;gap:7px}.wire-content>div span{height:8px;background:#d4d9dc}.wire-content>div span:nth-child(2){width:78%}.wire-content>div span:nth-child(3){width:57%}@media(max-width:820px){.gallery{grid-template-columns:1fr}.wire-canvas{min-height:360px}.kind-sidebar,.kind-list,.kind-media,.kind-form,.kind-table,.kind-content{min-height:220px}}
"""
    script = r"""
const spec=JSON.parse(document.getElementById('aipm-spec').textContent);const specHash=document.body.dataset.specHash;const storageKey=`aipm:lowfi:${spec.project}:${specHash}`;let data={};try{data=JSON.parse(localStorage.getItem(storageKey)||'{}')}catch(e){data={}};
const cards=[...document.querySelectorAll('.frame-card')];function persist(){localStorage.setItem(storageKey,JSON.stringify(data));updateSummary()}function updateSummary(){const values=Object.values(data);const passed=values.filter(x=>x.status==='passed').length;const issues=values.filter(x=>x.status==='open').length;document.getElementById('progress').textContent=`${passed}/${cards.length} 已确认 · ${issues} 个有问题`}
cards.forEach(card=>{const key=card.dataset.frame;const saved=data[key]||{};const status=card.querySelector('[data-role=status]');const comment=card.querySelector('[data-role=comment]');status.value=saved.status||'unreviewed';comment.value=saved.comment||'';status.addEventListener('change',()=>{data[key]={...data[key],status:status.value,comment:comment.value,updated_at:new Date().toISOString()};persist()});comment.addEventListener('input',()=>{data[key]={...data[key],status:status.value,comment:comment.value,updated_at:new Date().toISOString()};persist()})});
function feedback(decision){const items=cards.map(card=>{const [page_id,state_id]=card.dataset.frame.split('::');const item=data[card.dataset.frame]||{};return{feedback_id:`lowfi-${page_id}-${state_id}`,feedback_type:'frame-comment',page_id,state_id,status:item.status||'unreviewed',comment:item.comment||'',category:'other',severity:item.status==='open'?'major':'info',updated_at:item.updated_at||new Date().toISOString()}}).filter(x=>x.status!=='unreviewed'||x.comment);return{schema_version:1,project:spec.project,spec_hash:specHash,stage:'lowfi',decision,exported_at:new Date().toISOString(),items}}
function download(name,payload){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}
async function sync(payload){try{const r=await fetch('/__aipm_feedback__',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});return r.ok}catch(e){return false}}document.getElementById('exportFeedback').addEventListener('click',async()=>{const payload=feedback('revise');const saved=await sync(payload);if(!saved)download('lowfi-feedback.json',payload);toast(saved?'意见已同步到项目 feedback/':'已下载意见 JSON')});document.getElementById('approve').addEventListener('click',async()=>{const missing=cards.filter(c=>c.dataset.required==='true'&&(data[c.dataset.frame]?.status||'unreviewed')==='unreviewed');if(missing.length){toast(`还有 ${missing.length} 个必看关键帧未确认`);missing[0].scrollIntoView({behavior:'smooth',block:'center'});missing[0].classList.add('is-active');return}const hasIssue=cards.some(c=>data[c.dataset.frame]?.status==='open');const payload=feedback(hasIssue?'revise':'approved');const saved=await sync(payload);if(!saved)download('lowfi-approval.json',payload);toast(saved?(hasIssue?'修改意见已同步':'确认结果已同步'):(hasIssue?'已导出修改意见':'已导出低保真确认结果'))});
document.querySelectorAll('.flow-filter').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.flow-filter').forEach(x=>x.classList.toggle('active',x===btn));cards.forEach(card=>card.hidden=btn.dataset.flow!=='all'&&!card.dataset.flows.split(' ').includes(btn.dataset.flow))}));function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.hidden=false;setTimeout(()=>el.hidden=true,2600)}updateSummary();
"""
    return f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>{esc(spec['title'])} · 线框关键帧</title><style>{css}</style></head><body data-spec-hash="{spec_hash}"><header class="app-header"><div><h1>{esc(spec['title'])} · 线框确认</h1><p>先看清具体排版、页面结构和关键状态，再生成精细原型</p></div><div class="header-actions"><button class="btn" id="exportFeedback">导出意见</button><button class="btn btn-primary" id="approve">提交确认</button></div></header><div class="summary"><strong id="progress"></strong><span>所有关键帧均在本页展示</span><nav class="filters">{render_flow_filters(spec)}</nav></div><main class="gallery">{''.join(frames)}</main><div class="toast" id="toast" hidden></div><script type="application/json" id="aipm-spec">{embedded}</script><script>{script}</script></body></html>"""


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


def render_review(spec: dict[str, Any], prototype_src: str, prototype_hash: str = "") -> str:
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
            buttons.append(f'<button class="frame-nav-item" data-index="{frame_index}" data-flows="{esc(" ".join(flows))}"><i></i><span><b>{esc(state["title"])}</b><small>{esc(state.get("kind", "default"))}</small></span></button>')
            frame_index += 1
        nav_groups.append(f'<section class="frame-nav-group"><h3>{esc(page["title"])}</h3>{"".join(buttons)}</section>')
    embedded = json.dumps(frames, ensure_ascii=False).replace("</", "<\\/")
    flow_options = ['<option value="all">全部流程</option>'] + [f'<option value="{esc(flow["flow_id"])}">{esc(flow["title"])}</option>' for flow in spec["flows"]]
    css = COMMON_CSS + r"""
.review-shell{--nav-width:240px;--inspector-width:310px;display:grid;grid-template-columns:var(--nav-width) minmax(0,1fr) var(--inspector-width);height:calc(100vh - 64px);min-height:680px;background:#e9edef}.review-nav{overflow:auto;border-right:1px solid #d8dde0;background:#fff}.nav-toolbar{position:sticky;z-index:2;top:0;padding:12px;border-bottom:1px solid #e3e7e9;background:#fff}.nav-toolbar-head{display:flex;align-items:center;min-height:32px;margin-bottom:8px}.nav-toolbar-head strong{font-size:13px}.nav-toolbar-head .collapse-btn{margin-left:auto}.nav-toolbar label{display:grid;gap:5px;color:#69747b;font-size:11px}.nav-toolbar select{height:36px;padding:0 8px;border:1px solid #cbd3d7;border-radius:4px;background:#fff}.frame-nav-group{padding:12px 8px 5px}.frame-nav-group h3{margin:0 8px 7px;color:#7b858d;font-size:11px;font-weight:600}.frame-nav-item{width:100%;min-height:48px;padding:7px 9px;display:flex;align-items:center;gap:8px;border:1px solid transparent;border-radius:4px;color:#465159;background:#fff;text-align:left}.frame-nav-item:hover{background:#f5f8f7}.frame-nav-item.active{border-color:#99c7bd;background:#edf8f5}.frame-nav-item i{width:8px;height:8px;border:1px solid #a6b0b5;border-radius:50%;background:#fff}.frame-nav-item.status-passed i{border-color:#278260;background:#278260}.frame-nav-item.status-open i{border-color:#c7584d;background:#c7584d}.frame-nav-item.status-pending-review i{border-color:#c18529;background:#c18529}.frame-nav-item span{min-width:0;display:grid}.frame-nav-item b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.frame-nav-item small{color:#8a9399;font-size:10px}.review-stage{min-width:0;display:grid;grid-template-rows:auto minmax(0,1fr);padding:12px}.stage-head{min-height:76px;padding:10px 14px;display:flex;align-items:center;gap:14px;border:1px solid #d8dde0;border-bottom:0;border-radius:6px 6px 0 0;background:#fff}.stage-head>div:first-child{min-width:0}.stage-head span{color:#79838a;font-size:11px}.stage-head h2{margin:1px 0 2px;font-size:17px}.stage-head p{max-width:70ch;margin:0;overflow:hidden;color:#68737a;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.stage-actions{margin-left:auto;display:flex;align-items:center;gap:6px}.stage-actions a{text-decoration:none}.prototype-frame{position:relative;min-width:0;min-height:0;padding:10px;border:1px solid #d8dde0;border-radius:0 0 6px 6px;background:#dfe3e5}.prototype-frame iframe{position:relative;z-index:1;width:100%;height:100%;min-height:580px;border:1px solid #bfc7cb;background:#fff}.frame-state{position:absolute;z-index:2;inset:10px;display:grid;place-items:center;padding:24px;color:#68737a;background:#fff;text-align:center}.frame-state strong{display:block;margin-bottom:4px;color:#35434a;font-size:14px}.frame-loaded .frame-state{display:none}.frame-slow .frame-state{color:#8a5d17;background:#fffaf0}.review-inspector{display:flex;flex-direction:column;gap:14px;overflow:auto;padding:16px;border-left:1px solid #d8dde0;background:#fff}.inspector-head{display:flex;align-items:center;gap:8px}.inspector-head strong{font-size:15px}.inspector-head span{margin-left:auto;color:#7d878e;font-variant-numeric:tabular-nums;font-size:11px}.review-inspector label{display:grid;gap:6px;color:#58636b;font-size:12px}.review-inspector select,.review-inspector textarea{width:100%;border:1px solid #cbd3d7;border-radius:4px;background:#fff}.review-inspector select{height:38px;padding:0 8px}.review-inspector textarea{min-height:210px;padding:9px;resize:vertical}.annotation-count{padding:10px;border:1px solid #d6e6e2;border-radius:4px;color:#0f766e;background:#f1f8f6}.inspector-help{margin:0;color:#7b858d;font-size:11px}.inspector-actions{margin-top:auto;display:grid;gap:8px}.collapse-btn{width:32px;height:32px;padding:0;display:grid;place-items:center;border:1px solid #cbd3d7;border-radius:4px;background:#fff;cursor:pointer}.collapse-btn:hover{border-color:#9caaa9;background:#f3f7f6}.collapse-btn:focus-visible{outline:2px solid #0f766e;outline-offset:2px}.collapse-mark{width:8px;height:8px;border-top:2px solid #617078;border-right:2px solid #617078;transform:rotate(-135deg)}#toggleInspector .collapse-mark{transform:rotate(45deg)}.nav-collapsed .review-shell{--nav-width:48px}.inspector-collapsed .review-shell{--inspector-width:48px}.nav-collapsed .nav-toolbar{padding:8px}.nav-collapsed .nav-toolbar-head{justify-content:center;margin:0}.nav-collapsed .nav-toolbar-head strong,.nav-collapsed .nav-toolbar label,.nav-collapsed .frame-nav-group{display:none}.nav-collapsed .nav-toolbar-head .collapse-btn{margin:0}.nav-collapsed #toggleNav .collapse-mark{transform:rotate(45deg)}.inspector-collapsed .review-inspector{overflow:hidden;padding:8px}.inspector-collapsed .review-inspector>:not(.inspector-head){display:none}.inspector-collapsed .inspector-head{justify-content:center}.inspector-collapsed .inspector-head strong,.inspector-collapsed .inspector-head span{display:none}.inspector-collapsed #toggleInspector .collapse-mark{transform:rotate(-135deg)}@media(max-width:1180px){.review-shell{grid-template-columns:var(--nav-width) minmax(0,1fr)}.review-inspector{grid-column:1/-1;display:grid;grid-template-columns:180px minmax(0,1fr) 160px;height:auto;border-top:1px solid #d8dde0;border-left:0}.review-inspector textarea{min-height:90px}.inspector-actions{margin-top:0}.inspector-collapsed .review-inspector{display:flex;height:48px}}@media(max-width:780px){.review-shell{display:block;height:auto}.review-nav{max-height:280px}.review-stage{min-height:680px}.prototype-frame iframe{height:560px}.review-inspector{display:flex}.stage-head{align-items:flex-start;flex-direction:column}.stage-actions{margin-left:0}}
"""
    script = r"""(()=>{'use strict';
const frames=JSON.parse(document.getElementById('aipm-frames').textContent);const project=document.body.dataset.project;const specHash=document.body.dataset.specHash;const prototypeHash=document.body.dataset.prototypeHash;const storageKey=`aipm:review:${project}:${specHash}`;let data={};try{data=JSON.parse(localStorage.getItem(storageKey)||'{}')}catch(e){data={}}let current=0;let activeFlow='all';const nav=[...document.querySelectorAll('.frame-nav-item')];const status=document.getElementById('reviewStatus');const comment=document.getElementById('reviewComment');
const shellKey=`aipm:review-shell:${project}`;let shellState={navCollapsed:false,inspectorCollapsed:false};try{shellState={...shellState,...JSON.parse(localStorage.getItem(shellKey)||'{}')}}catch(e){}let frameTimer=0;const frameHost=document.getElementById('frameHost');const frameState=document.getElementById('frameState');const prototypeFrame=document.getElementById('prototypeFrame');function applyShell(){document.body.classList.toggle('nav-collapsed',!!shellState.navCollapsed);document.body.classList.toggle('inspector-collapsed',!!shellState.inspectorCollapsed);const navButton=document.getElementById('toggleNav');const inspectorButton=document.getElementById('toggleInspector');navButton.setAttribute('aria-expanded',String(!shellState.navCollapsed));navButton.setAttribute('aria-label',shellState.navCollapsed?'展开关键页面':'收起关键页面');navButton.title=navButton.getAttribute('aria-label');inspectorButton.setAttribute('aria-expanded',String(!shellState.inspectorCollapsed));inspectorButton.setAttribute('aria-label',shellState.inspectorCollapsed?'展开巡检记录':'收起巡检记录');inspectorButton.title=inspectorButton.getAttribute('aria-label')}function persistShell(){try{localStorage.setItem(shellKey,JSON.stringify(shellState))}catch(e){}applyShell()}document.getElementById('toggleNav').addEventListener('click',()=>{shellState.navCollapsed=!shellState.navCollapsed;persistShell()});document.getElementById('toggleInspector').addEventListener('click',()=>{shellState.inspectorCollapsed=!shellState.inspectorCollapsed;persistShell()});prototypeFrame.addEventListener('load',()=>{clearTimeout(frameTimer);frameHost.classList.add('frame-loaded');frameHost.classList.remove('frame-slow')});
function visibleIndices(){return frames.map((frame,index)=>({frame,index})).filter(({frame})=>activeFlow==='all'||frame.flows.includes(activeFlow)).map(({index})=>index)}function currentData(){return data[frames[current].key]||{status:'unreviewed',comment:''}}function persist(){try{localStorage.setItem(storageKey,JSON.stringify(data))}catch(e){}renderSummary()}function updateCurrent(){const frame=frames[current];data[frame.key]={...data[frame.key],status:status.value,comment:comment.value,updated_at:new Date().toISOString()};persist();updateNavState(current)}
function updateNavState(index){const frame=frames[index];const item=data[frame.key]||{};nav[index].className=`frame-nav-item ${index===current?'active':''} status-${item.status||'unreviewed'}`}
function selectFrame(index,pushHash=true){if(!frames[index])return;current=index;const frame=frames[index];document.getElementById('currentPage').textContent=frame.page_title;document.getElementById('currentTitle').textContent=frame.state_title;document.getElementById('currentDescription').textContent=frame.description;document.getElementById('frameCounter').textContent=`${index+1} / ${frames.length}`;frameHost.classList.remove('frame-loaded','frame-slow');frameState.innerHTML='<div><strong>正在加载页面</strong><span>请稍候</span></div>';clearTimeout(frameTimer);frameTimer=setTimeout(()=>{frameHost.classList.add('frame-slow');frameState.innerHTML='<div><strong>页面加载时间较长</strong><span>可以使用上方“独立打开”继续查看</span></div>'},8000);prototypeFrame.src=frame.src;prototypeFrame.title=`${frame.page_title} - ${frame.state_title}`;document.getElementById('openInteractive').href=frame.src;const saved=currentData();status.value=saved.status||'unreviewed';comment.value=saved.comment||'';nav.forEach((_,navIndex)=>updateNavState(navIndex));if(pushHash)history.replaceState(null,'',`#frame=${encodeURIComponent(frame.key)}`)}
function move(delta){const visible=visibleIndices();const position=visible.indexOf(current);const next=visible[(position+delta+visible.length)%visible.length];if(next!==undefined)selectFrame(next)}nav.forEach((button,index)=>button.addEventListener('click',()=>selectFrame(index)));status.addEventListener('change',updateCurrent);comment.addEventListener('input',updateCurrent);document.getElementById('prevFrame').addEventListener('click',()=>move(-1));document.getElementById('nextFrame').addEventListener('click',()=>move(1));document.getElementById('flowSelect').addEventListener('change',event=>{activeFlow=event.target.value;nav.forEach((button,index)=>button.hidden=activeFlow!=='all'&&!frames[index].flows.includes(activeFlow));document.querySelectorAll('.frame-nav-group').forEach(group=>group.hidden=![...group.querySelectorAll('.frame-nav-item')].some(button=>!button.hidden));const visible=visibleIndices();if(!visible.includes(current)&&visible.length)selectFrame(visible[0])});
function payload(){const items=frames.map(frame=>{const item=data[frame.key]||{};return{feedback_id:`review-${frame.page_id}-${frame.state_id}`,feedback_type:'review-comment',page_id:frame.page_id,state_id:frame.state_id,status:item.status||'unreviewed',comment:item.comment||'',category:'other',severity:item.status==='open'?'major':'info',updated_at:item.updated_at||new Date().toISOString()}}).filter(item=>item.status!=='unreviewed'||item.comment);return{schema_version:1,project,spec_hash:specHash,prototype_hash:prototypeHash,stage:'highfi-review',exported_at:new Date().toISOString(),items}}function download(value){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));a.download='review-feedback.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}async function sync(){const value=payload();try{const response=await fetch('/__aipm_feedback__',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});if(response.ok){showSaved();return}}catch(e){}download(value)}document.getElementById('exportFeedback').addEventListener('click',sync);document.getElementById('saveFrame').addEventListener('click',async()=>{updateCurrent();await sync()});function showSaved(){const button=document.getElementById('saveFrame');const previous=button.textContent;button.textContent='已保存';setTimeout(()=>button.textContent=previous,1600)}function renderSummary(){const values=Object.values(data);document.getElementById('progress').textContent=`${values.filter(item=>item.status==='passed').length}/${frames.length} 已通过 · ${values.filter(item=>item.status==='open').length} 个有问题`}
window.addEventListener('message',event=>{if(!event.data||event.data.type!=='aipm:annotations-changed')return;if(event.data.frame===frames[current].key)document.getElementById('annotationCount').textContent=`页面标注 ${event.data.count} 条`});document.addEventListener('keydown',event=>{if(event.altKey&&event.key==='ArrowLeft')move(-1);if(event.altKey&&event.key==='ArrowRight')move(1)});const requested=decodeURIComponent((location.hash.match(/frame=([^&]+)/)||[])[1]||'');const initial=frames.findIndex(frame=>frame.key===requested);applyShell();selectFrame(initial>=0?initial:0,false);renderSummary();})();
"""
    return f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>{esc(spec['title'])} · 原型巡检</title><style>{css}</style></head><body data-project="{esc(spec['project'])}" data-spec-hash="{spec_hash}" data-prototype-hash="{esc(prototype_hash)}"><header class="app-header"><div><h1>{esc(spec['title'])} · 精细原型巡检</h1><p>从左侧切换关键页面，在右侧记录结论和评论</p></div><div class="header-actions"><strong id="progress"></strong><button class="btn btn-primary" id="exportFeedback">提交全部巡检意见</button></div></header><main class="review-shell"><aside class="review-nav" id="reviewNav"><div class="nav-toolbar"><div class="nav-toolbar-head"><strong>关键页面</strong><button class="collapse-btn" id="toggleNav" type="button" aria-controls="reviewNav" aria-expanded="true" aria-label="收起关键页面"><i class="collapse-mark" aria-hidden="true"></i></button></div><label>查看范围<select id="flowSelect">{''.join(flow_options)}</select></label></div><nav>{''.join(nav_groups)}</nav></aside><section class="review-stage"><header class="stage-head"><div><span id="currentPage"></span><h2 id="currentTitle"></h2><p id="currentDescription"></p></div><div class="stage-actions"><button class="btn" id="prevFrame">上一页</button><button class="btn" id="nextFrame">下一页</button><a class="btn" id="openInteractive" target="_blank" rel="noopener">独立打开</a></div></header><div class="prototype-frame" id="frameHost"><div class="frame-state" id="frameState" role="status"><div><strong>正在加载页面</strong><span>请稍候</span></div></div><iframe id="prototypeFrame" title="正在加载原型"></iframe></div></section><aside class="review-inspector" id="reviewInspector"><div class="inspector-head"><strong>巡检记录</strong><span id="frameCounter"></span><button class="collapse-btn" id="toggleInspector" type="button" aria-controls="reviewInspector" aria-expanded="true" aria-label="收起巡检记录"><i class="collapse-mark" aria-hidden="true"></i></button></div><label>当前结论<select id="reviewStatus"><option value="unreviewed">未检查</option><option value="passed">通过</option><option value="open">有问题</option><option value="pending-review">待复核</option><option value="not-applicable">不适用</option></select></label><label>页面评论<textarea id="reviewComment" placeholder="记录当前页面的问题、建议或确认结论"></textarea></label><div class="annotation-count" id="annotationCount">页面标注 0 条</div><p class="inspector-help">在中间原型内使用右下角“添加标签”，可直接标记具体位置。</p><div class="inspector-actions"><button class="btn btn-primary" id="saveFrame">保存当前页意见</button></div></aside></main><script type="application/json" id="aipm-frames">{embedded}</script><script>{script}</script></body></html>"""


def annotation_runtime() -> str:
    template = Path(__file__).resolve().parents[1] / "templates" / "prototype-collab" / "annotation-runtime.js"
    if template.is_file():
        return template.read_text(encoding="utf-8")
    return r"""(()=>{'use strict';if(window.__AIPM_ANNOTATION_RUNTIME__)return;window.__AIPM_ANNOTATION_RUNTIME__=true;const script=document.currentScript;const project=script?.dataset.aipmProject||document.title||'prototype';const specHash=script?.dataset.aipmSpecHash||'';const params=new URLSearchParams(location.search);const routeParams=new URLSearchParams(params);routeParams.delete('aipm_rev');const routeQuery=routeParams.toString();const routeKey=(routeQuery?`?${routeQuery}`:'')+location.hash;const route=location.pathname+routeKey;let routeMap={};try{routeMap=JSON.parse(script?.dataset.aipmRouteMap||'{}')}catch(e){routeMap={}}const mapped=routeMap[routeKey]||{};const pageId=document.body.dataset.aipmPage||mapped.page_id||params.get('view')||location.pathname.split('/').pop()||'page';const stateId=document.body.dataset.aipmState||mapped.state_id||params.get('scenario')||'default';const frame=`${pageId}::${stateId}`;const key=`aipm:annotations:${project}:${specHash}`;let state={items:[]};try{state=JSON.parse(localStorage.getItem(key)||'{"items":[]}')}catch(e){state={items:[]}}if(!Array.isArray(state.items))state.items=[];let placing=false,active=null;
const host=document.createElement('div');host.id='aipm-annotation-host';document.documentElement.appendChild(host);const root=host.attachShadow({mode:'open'});root.innerHTML=`<style>*{box-sizing:border-box;letter-spacing:0}.launcher{position:fixed;z-index:2147483645;right:18px;bottom:18px;display:flex;gap:6px;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}.btn{min-height:36px;padding:6px 12px;border:1px solid #cbd3d7;border-radius:5px;color:#344149;background:#fff;box-shadow:0 5px 18px rgba(20,35,42,.16);cursor:pointer}.btn.primary{color:#fff;border-color:#0f766e;background:#0f766e}.panel{position:fixed;z-index:2147483644;top:16px;right:16px;width:340px;max-height:calc(100vh - 78px);overflow:auto;border:1px solid #cfd6da;border-radius:7px;background:#fff;box-shadow:0 14px 38px rgba(20,35,42,.22);font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}.head{position:sticky;top:0;display:flex;align-items:center;padding:12px 14px;border-bottom:1px solid #e3e7e9;background:#fff}.head strong{font-size:15px}.head button{margin-left:auto;border:0;background:transparent;cursor:pointer}.tools{display:flex;gap:6px;padding:10px;border-bottom:1px solid #e7eaec}.tools button{flex:1}.list{padding:8px}.item{width:100%;margin-bottom:7px;padding:10px;border:1px solid #dbe0e3;border-radius:5px;background:#fff;text-align:left;cursor:pointer}.item.feature-note{border-left:4px solid #2563eb}.item.change-request{border-left:4px solid #dc5b45}.item.review-comment,.item.question{border-left:4px solid #d28a25}.item.resolved{opacity:.55}.meta{display:flex;justify-content:space-between;color:#7b858d;font-size:10px}.item strong{display:block;margin:4px 0}.empty{padding:28px 16px;color:#7b858d;text-align:center}.form{position:fixed;z-index:2147483646;top:50%;left:50%;width:min(440px,calc(100vw - 32px));transform:translate(-50%,-50%);padding:18px;border-radius:7px;background:#fff;box-shadow:0 20px 55px rgba(15,25,30,.3);font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}.form h3{margin:0 0 12px}.form label{display:grid;gap:5px;margin-top:10px;color:#56616a}.form input,.form select,.form textarea{width:100%;border:1px solid #cbd3d7;border-radius:4px;font:inherit}.form input,.form select{height:36px;padding:0 8px}.form textarea{min-height:90px;padding:8px;resize:vertical}.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.backdrop{position:fixed;z-index:2147483645;inset:0;background:rgba(26,38,44,.35)}.pin{position:fixed;z-index:2147483643;width:27px;height:27px;border:2px solid #fff;border-radius:50%;color:#fff;background:#dc5b45;box-shadow:0 3px 9px rgba(20,30,35,.28);font:700 11px/23px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;cursor:pointer}.pin.feature-note{background:#2563eb}.pin.review-comment,.pin.question{background:#d28a25}.hint{position:fixed;z-index:2147483642;top:14px;left:50%;transform:translateX(-50%);padding:9px 13px;border-radius:5px;color:#fff;background:#263f4b;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}.hidden{display:none!important}</style><div class="launcher"><button class="btn primary" id="place">添加标签</button><button class="btn" id="open">标签列表 <span id="count">0</span></button></div><section class="panel hidden" id="panel"><div class="head"><strong>页面标注</strong><button id="close" aria-label="关闭">×</button></div><div class="tools"><button class="btn" id="export">导出</button><button class="btn" id="import">导入</button><input type="file" id="file" accept="application/json" hidden></div><div class="list" id="list"></div></section><div id="pins"></div><div class="hint hidden" id="hint">点击页面元素或位置添加标签，Esc 取消</div>`;
const $=id=>root.getElementById(id);function save(){localStorage.setItem(key,JSON.stringify(state));render();window.parent?.postMessage({type:'aipm:annotations-changed',frame,count:state.items.filter(x=>x.page_id===pageId&&x.state_id===stateId).length},'*')}function cssEscape(v){return window.CSS?.escape?CSS.escape(v):String(v).replace(/[^a-zA-Z0-9_-]/g,'\\$&')}function selector(el){if(el.dataset?.aipmId)return`[data-aipm-id="${cssEscape(el.dataset.aipmId)}"]`;if(el.id)return`#${cssEscape(el.id)}`;const parts=[];let cur=el;while(cur&&cur.nodeType===1&&cur!==document.body&&parts.length<5){let part=cur.tagName.toLowerCase();const cls=[...cur.classList].filter(x=>!x.startsWith('aipm-')).slice(0,2);if(cls.length)part+=cls.map(x=>'.'+cssEscape(x)).join('');const siblings=cur.parentElement?[...cur.parentElement.children].filter(x=>x.tagName===cur.tagName):[];if(siblings.length>1)part+=`:nth-of-type(${siblings.indexOf(cur)+1})`;parts.unshift(part);cur=cur.parentElement}return parts.join('>')}function anchorFor(el,x,y){const stable=el.closest('[data-aipm-id]');const rect=el.getBoundingClientRect();return{strategy:stable?'stable-id':'selector',stable_id:stable?.dataset.aipmId||'',selector:selector(stable||el),text:(el.innerText||el.textContent||'').trim().slice(0,160),x_ratio:Math.max(0,Math.min(1,(x-rect.left)/Math.max(1,rect.width))),y_ratio:Math.max(0,Math.min(1,(y-rect.top)/Math.max(1,rect.height))),page_x_ratio:x/document.documentElement.clientWidth,page_y_ratio:(y+scrollY)/Math.max(1,document.documentElement.scrollHeight)}}function resolve(item){const a=item.anchor||{};let el=null;if(a.stable_id)el=document.querySelector(`[data-aipm-id="${cssEscape(a.stable_id)}"]`);if(!el&&a.selector){try{el=document.querySelector(a.selector)}catch(e){}}if(el)return{el,drift:false};return{el:null,drift:true}}function position(pin,item){const found=resolve(item);if(found.el){const r=found.el.getBoundingClientRect();pin.style.left=`${r.left+(item.anchor.x_ratio||.5)*r.width-13}px`;pin.style.top=`${r.top+(item.anchor.y_ratio||.5)*r.height-13}px`;pin.title=item.comment||item.feedback_type}else{pin.style.left=`${(item.anchor.page_x_ratio||.5)*innerWidth-13}px`;pin.style.top=`${(item.anchor.page_y_ratio||.5)*document.documentElement.scrollHeight-scrollY-13}px`;item.status='anchor-drift';pin.title='定位已漂移：'+(item.comment||'')}}function render(){const own=state.items.filter(x=>x.page_id===pageId&&x.state_id===stateId);$('count').textContent=own.length;$('list').innerHTML=own.length?'':`<div class="empty">还没有标签</div>`;$('pins').innerHTML='';own.forEach((item,index)=>{const row=document.createElement('button');row.className=`item ${item.feedback_type} ${item.status==='resolved'?'resolved':''}`;row.innerHTML=`<span class="meta"><span>#${index+1} ${item.feedback_type==='feature-note'?'功能说明':item.feedback_type==='change-request'?'修改意见':item.feedback_type==='question'?'问题':'评审评论'}</span><span>${item.status}</span></span><span>${escapeHtml(item.comment)}</span>`;row.onclick=()=>openDetail(item);$('list').appendChild(row);const pin=document.createElement('button');pin.className=`pin ${item.feedback_type}`;pin.textContent=String(index+1);pin.onclick=()=>{openDetail(item);$('panel').classList.remove('hidden')};$('pins').appendChild(pin);position(pin,item)})}function escapeHtml(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function startPlace(){placing=true;$('hint').classList.remove('hidden');$('panel').classList.add('hidden');document.documentElement.style.cursor='crosshair'}function stopPlace(){placing=false;$('hint').classList.add('hidden');document.documentElement.style.cursor=''}function form(item,anchor){const backdrop=document.createElement('div');backdrop.className='backdrop';const box=document.createElement('div');box.className='form';box.innerHTML=`<h3>${item?'编辑标签':'添加页面标签'}</h3><label>类型<select id="type"><option value="feature-note">功能说明</option><option value="review-comment">评审评论</option><option value="change-request">修改意见</option><option value="question">问题</option></select></label><label>内容<textarea id="comment" placeholder="说明功能，或写清要修改什么"></textarea></label><div class="actions"><button class="btn" id="cancel">取消</button><button class="btn primary" id="save">保存</button></div>`;root.append(backdrop,box);const get=id=>box.querySelector('#'+id);get('type').value=item?.feedback_type||'review-comment';get('comment').value=item?.comment||'';const close=()=>{backdrop.remove();box.remove()};get('cancel').onclick=close;backdrop.onclick=close;get('save').onclick=()=>{const comment=get('comment').value.trim();if(!comment){get('comment').focus();return}const now=new Date().toISOString();const payload={feedback_id:item?.feedback_id||`ann-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,feedback_type:get('type').value,page_id:pageId,state_id:stateId,target_id:anchor?.stable_id||item?.target_id||'',status:item?.status||'open',category:get('type').value==='change-request'?'interaction':'other',severity:get('type').value==='feature-note'?'info':'minor',title:item?.title||'',comment,expected:item?.expected||'',doc_refs:item?.doc_refs||[],anchor:anchor||item?.anchor||{strategy:'frame'},route,created_at:item?.created_at||now,updated_at:now};if(item){Object.assign(item,payload)}else state.items.push(payload);close();save()}}function openDetail(item){form(item,null)}function clickCapture(e){if(!placing)return;if(e.composedPath().includes(host))return;e.preventDefault();e.stopPropagation();const el=e.target;const anchor=anchorFor(el,e.clientX,e.clientY);stopPlace();form(null,anchor)}document.addEventListener('click',clickCapture,true);document.addEventListener('keydown',e=>{if(e.key==='Escape')stopPlace()});$('place').onclick=startPlace;$('open').onclick=()=>$('panel').classList.toggle('hidden');$('close').onclick=()=>$('panel').classList.add('hidden');$('export').onclick=()=>{const payload={schema_version:1,project,spec_hash:specHash,stage:'annotation',exported_at:new Date().toISOString(),items:state.items};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));a.download='annotations.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)};$('import').onclick=()=>$('file').click();$('file').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{const incoming=JSON.parse(await file.text());if(!Array.isArray(incoming.items))throw new Error('items');const ids=new Set(state.items.map(x=>x.feedback_id));incoming.items.forEach(x=>{if(!ids.has(x.feedback_id))state.items.push(x)});save()}catch(err){alert('无法导入：文件格式不正确')}e.target.value=''};addEventListener('scroll',render,{passive:true});addEventListener('resize',render);render();})();"""


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


def command_render_lowfi(args: argparse.Namespace) -> int:
    spec = load_json(Path(args.spec))
    errors = validate_spec(spec)
    if errors:
        raise SpecError("；".join(errors))
    out = Path(args.out)
    write_text(out, render_lowfi(spec))
    print(f"LOWFI: {out}")
    print(f"SPEC_HASH: {content_hash(spec)}")
    return 0


def command_render_review(args: argparse.Namespace) -> int:
    spec_path = Path(args.spec)
    spec = load_json(spec_path)
    errors = validate_spec(spec)
    if errors:
        raise SpecError("；".join(errors))
    out = Path(args.out)
    prototype = Path(args.prototype).resolve()
    prototype_src = os.path.relpath(prototype, out.parent.resolve()).replace(os.sep, "/")
    prototype_hash = hashlib.sha256(prototype.read_bytes()).hexdigest() if prototype.exists() else "missing"
    write_text(out, render_review(spec, prototype_src, prototype_hash))
    print(f"REVIEW: {out}")
    print(f"PROTOTYPE_HASH: {prototype_hash}")
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
    write_text(out, annotation_runtime())
    print(f"RUNTIME: {out}")
    return 0


def command_instrument(args: argparse.Namespace) -> int:
    spec = load_json(Path(args.spec))
    errors = validate_spec(spec)
    if errors:
        raise SpecError("；".join(errors))
    html_path = Path(args.html)
    runtime_path = Path(args.runtime) if args.runtime else html_path.parent / "runtime" / "annotation-runtime.js"
    write_text(runtime_path, annotation_runtime())
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
    lowfi.set_defaults(func=command_render_lowfi)
    review = sub.add_parser("render-review", help="生成精细原型巡检画廊")
    review.add_argument("--spec", required=True)
    review.add_argument("--prototype", required=True)
    review.add_argument("--out", required=True)
    review.set_defaults(func=command_render_review)
    check_html = sub.add_parser("check-html", help="检查原型 HTML 的资源路径和重复 ID")
    check_html.add_argument("--html", required=True)
    check_html.set_defaults(func=command_check_html)
    runtime = sub.add_parser("emit-runtime", help="生成标注运行时")
    runtime.add_argument("--out", required=True)
    runtime.set_defaults(func=command_emit_runtime)
    instrument = sub.add_parser("instrument", help="向原型 HTML 注入标注运行时")
    instrument.add_argument("--spec", required=True)
    instrument.add_argument("--html", required=True)
    instrument.add_argument("--runtime")
    instrument.set_defaults(func=command_instrument)
    summarize = sub.add_parser("summarize-feedback", help="把反馈 JSON 转为 AI 修改预览")
    summarize.add_argument("--feedback", required=True)
    summarize.add_argument("--out")
    summarize.set_defaults(func=command_summarize)
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
