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
