#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""纯标准库 PNG 读写与区块级差异。

只支持 8-bit truecolor（colorType=2）非隔行——实测 chrome-headless-shell
就输出这一种。遇到别的格式明确报错，不猜。
scripts/ 全树零第三方依赖，所以不能用 PIL。
"""

from __future__ import annotations

from pathlib import Path
import struct
from typing import Any
import zlib

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
BYTES_PER_PIXEL = 3


class PngError(ValueError):
    pass


def _chunks(raw: bytes):
    pos = len(PNG_MAGIC)
    while pos + 8 <= len(raw):
        length = struct.unpack(">I", raw[pos:pos + 4])[0]
        name = raw[pos + 4:pos + 8]
        payload = raw[pos + 8:pos + 8 + length]
        yield name, payload
        pos += 12 + length


def _paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def read_png(path: Path) -> tuple[int, int, bytes]:
    raw = Path(path).read_bytes()
    if not raw.startswith(PNG_MAGIC):
        raise PngError(f"不是 PNG 文件: {path}")

    width = height = 0
    idat = bytearray()
    seen_header = False
    for name, payload in _chunks(raw):
        if name == b"IHDR":
            # accept 的 design_diff_section 只接 PngError；短载荷在这里就得拦，
            # 不能漏成 struct.error
            if len(payload) < 13:
                raise PngError(f"IHDR 载荷不足 13 字节，实际 {len(payload)}: {path}")
            width, height, depth, color_type, compression, filter_method, interlace = struct.unpack(
                ">IIBBBBB", payload[:13]
            )
            if depth != 8:
                raise PngError(f"只支持 bitDepth=8，实际 {depth}: {path}")
            if color_type != 2:
                raise PngError(f"只支持 colorType=2（truecolor），实际 {color_type}: {path}")
            if interlace != 0:
                raise PngError(f"不支持隔行 PNG: {path}")
            if compression != 0 or filter_method != 0:
                raise PngError(f"不支持的压缩或过滤方式: {path}")
            seen_header = True
        elif name == b"IDAT":
            idat.extend(payload)
        elif name == b"IEND":
            break

    if not seen_header:
        raise PngError(f"PNG 缺少 IHDR: {path}")

    try:
        data = zlib.decompress(bytes(idat))
    except zlib.error as exc:
        raise PngError(f"PNG 数据解压失败: {path}: {exc}") from exc

    stride = width * BYTES_PER_PIXEL
    expected = (stride + 1) * height
    if len(data) != expected:
        raise PngError(f"PNG 扫描行长度不符，期望 {expected} 实际 {len(data)}: {path}")

    out = bytearray(stride * height)
    previous = bytearray(stride)
    pos = 0
    for row in range(height):
        filter_type = data[pos]
        pos += 1
        line = bytearray(data[pos:pos + stride])
        pos += stride
        if filter_type == 1:
            for i in range(BYTES_PER_PIXEL, stride):
                line[i] = (line[i] + line[i - BYTES_PER_PIXEL]) & 0xFF
        elif filter_type == 2:
            for i in range(stride):
                line[i] = (line[i] + previous[i]) & 0xFF
        elif filter_type == 3:
            for i in range(stride):
                left = line[i - BYTES_PER_PIXEL] if i >= BYTES_PER_PIXEL else 0
                line[i] = (line[i] + ((left + previous[i]) >> 1)) & 0xFF
        elif filter_type == 4:
            for i in range(stride):
                left = line[i - BYTES_PER_PIXEL] if i >= BYTES_PER_PIXEL else 0
                upper_left = previous[i - BYTES_PER_PIXEL] if i >= BYTES_PER_PIXEL else 0
                line[i] = (line[i] + _paeth(left, previous[i], upper_left)) & 0xFF
        elif filter_type != 0:
            raise PngError(f"未知过滤类型 {filter_type}: {path}")
        out[row * stride:(row + 1) * stride] = line
        previous = line

    return width, height, bytes(out)


def encode_png(width: int, height: int, rgb: bytes) -> bytes:
    """只给测试造样本用，一律走 filter 0。"""
    stride = width * BYTES_PER_PIXEL
    raw = bytearray()
    for row in range(height):
        raw.append(0)
        raw.extend(rgb[row * stride:(row + 1) * stride])
    out = bytearray(PNG_MAGIC)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    for name, payload in ((b"IHDR", ihdr), (b"IDAT", zlib.compress(bytes(raw))), (b"IEND", b"")):
        out += struct.pack(">I", len(payload)) + name + payload
        out += struct.pack(">I", zlib.crc32(name + payload) & 0xFFFFFFFF)
    return bytes(out)


SCHEMA_VERSION = 1


def _region_diff(base: bytes, cand: bytes, width: int, box: tuple[int, int, int, int], threshold: int) -> float:
    x0, y0, w, h = box
    differing = 0
    total = w * h
    for row in range(y0, y0 + h):
        start = (row * width + x0) * BYTES_PER_PIXEL
        end = start + w * BYTES_PER_PIXEL
        base_row = base[start:end]
        cand_row = cand[start:end]
        for i in range(0, len(base_row), BYTES_PER_PIXEL):
            if (abs(base_row[i] - cand_row[i]) > threshold
                    or abs(base_row[i + 1] - cand_row[i + 1]) > threshold
                    or abs(base_row[i + 2] - cand_row[i + 2]) > threshold):
                differing += 1
    return differing / total if total else 0.0


def diff_regions(
    baseline: Path,
    candidate: Path,
    regions: list[dict],
    threshold: int = 16,
    top: int = 10,
) -> dict[str, Any]:
    """按区块出偏差榜。不给全局通过阈值——全局数字说不出该改哪里。"""
    base_w, base_h, base_rgb = read_png(baseline)
    cand_w, cand_h, cand_rgb = read_png(candidate)
    if (base_w, base_h) != (cand_w, cand_h):
        raise PngError(f"两张图尺寸不一致：{base_w}×{base_h} vs {cand_w}×{cand_h}")

    scored: list[dict[str, Any]] = []
    skipped: list[dict[str, str]] = []
    for region in regions or []:
        x0 = int(region.get("x") or 0)
        y0 = int(region.get("y") or 0)
        w = int(region.get("width") or 0)
        h = int(region.get("height") or 0)
        if w <= 0 or h <= 0 or x0 < 0 or y0 < 0 or x0 + w > base_w or y0 + h > base_h:
            skipped.append({"id": str(region.get("id")), "reason": "区块超出画布"})
            continue
        ratio = _region_diff(base_rgb, cand_rgb, base_w, (x0, y0, w, h), threshold)
        scored.append({
            "id": region.get("id"), "name": region.get("name"),
            "diff_ratio": round(ratio, 4),
            "x": x0, "y": y0, "width": w, "height": h,
        })

    scored.sort(key=lambda item: (-item["diff_ratio"], str(item["id"])))
    overall = _region_diff(base_rgb, cand_rgb, base_w, (0, 0, base_w, base_h), threshold)
    return {
        "schema_version": SCHEMA_VERSION,
        "canvas": {"width": base_w, "height": base_h},
        "overall_diff_ratio": round(overall, 4),
        "regions": scored[:top],
        "skipped": skipped,
    }
