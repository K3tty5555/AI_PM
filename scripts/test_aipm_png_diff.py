#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import importlib.util
from pathlib import Path
import tempfile
import unittest
import zlib

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "aipm_png_diff.py"

_spec = importlib.util.spec_from_file_location("aipm_png_diff", MODULE_PATH)
module = importlib.util.module_from_spec(_spec)
assert _spec.loader
_spec.loader.exec_module(module)


def write_png(path, width, height, rgb):
    path.write_bytes(module.encode_png(width, height, rgb))


def _paeth_predictor(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


class ReadPngTests(unittest.TestCase):
    def test_roundtrip_solid_colour(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "a.png"
            rgb = bytes([10, 20, 30]) * 6
            write_png(path, 3, 2, rgb)
            self.assertEqual(module.read_png(path), (3, 2, rgb))

    def test_roundtrip_gradient(self):
        width, height = 8, 8
        rgb = bytes(bytearray((x * 7 + y * 3) % 256 for y in range(height) for x in range(width) for _ in range(3)))
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "g.png"
            write_png(path, width, height, rgb)
            self.assertEqual(module.read_png(path)[2], rgb)

    def test_all_filter_types_are_decoded_correctly(self):
        # encode_png 只发 filter 0，Sub/Up/Average/Paeth 四条解码分支得手工造：
        # 4 行各用一种过滤器（1/2/3/4），手工算过滤后的扫描行再拼 PNG。
        import struct
        width, height = 3, 4
        bpp = 3
        stride = width * bpp
        rows = []
        for y in range(height):
            row = bytearray()
            for x in range(width):
                # 每行每像素都不同，保证每个过滤器都在真变换数据
                row.extend(((x * 37 + y * 11 + 5) % 256,
                            (x * 17 + y * 71 + 90) % 256,
                            (x * 89 + y * 3 + 200) % 256))
            rows.append(bytes(row))
        rgb = b"".join(rows)

        filters = [1, 2, 3, 4]  # Sub / Up / Average / Paeth
        raw = bytearray()
        prior = bytes(stride)
        for row, f in zip(rows, filters):
            encoded = bytearray(stride)
            for i in range(stride):
                left = row[i - bpp] if i >= bpp else 0
                up = prior[i]
                upper_left = prior[i - bpp] if i >= bpp else 0
                if f == 1:
                    pred = left
                elif f == 2:
                    pred = up
                elif f == 3:
                    pred = (left + up) >> 1
                else:
                    pred = _paeth_predictor(left, up, upper_left)
                encoded[i] = (row[i] - pred) & 0xFF
            self.assertNotEqual(bytes(encoded), row)  # 过滤器真的动了数据
            raw.append(f)
            raw.extend(encoded)
            prior = row

        compressed = zlib.compress(bytes(raw))
        out = bytearray(b"\x89PNG\r\n\x1a\n")
        ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
        for name, payload in ((b"IHDR", ihdr), (b"IDAT", compressed), (b"IEND", b"")):
            out += struct.pack(">I", len(payload)) + name + payload
            out += struct.pack(">I", zlib.crc32(name + payload) & 0xFFFFFFFF)
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "filters.png"
            path.write_bytes(bytes(out))
            self.assertEqual(module.read_png(path), (width, height, rgb))

    def test_non_png_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "x.png"
            path.write_bytes(b"not a png at all")
            with self.assertRaises(module.PngError):
                module.read_png(path)

    def test_unsupported_colour_type_is_rejected_loudly(self):
        # 造一个 colorType=6（RGBA）的头，应当明确拒绝而不是猜
        import struct
        ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0)
        chunk = struct.pack(">I", len(ihdr)) + b"IHDR" + ihdr
        chunk += struct.pack(">I", zlib.crc32(b"IHDR" + ihdr) & 0xFFFFFFFF)
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "rgba.png"
            path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk)
            with self.assertRaises(module.PngError) as ctx:
                module.read_png(path)
            self.assertIn("colorType", str(ctx.exception))

    def test_multiple_idat_chunks_are_concatenated(self):
        # chrome-headless-shell 实测输出 70 个 IDAT
        width, height = 4, 4
        rgb = bytes([200, 100, 50]) * (width * height)
        raw = bytearray()
        for y in range(height):
            raw.append(0)
            raw.extend(rgb[y * width * 3:(y + 1) * width * 3])
        compressed = zlib.compress(bytes(raw))
        import struct
        out = bytearray(b"\x89PNG\r\n\x1a\n")
        ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
        for name, payload in ((b"IHDR", ihdr),
                              (b"IDAT", compressed[:3]), (b"IDAT", compressed[3:]),
                              (b"IEND", b"")):
            out += struct.pack(">I", len(payload)) + name + payload
            out += struct.pack(">I", zlib.crc32(name + payload) & 0xFFFFFFFF)
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "multi.png"
            path.write_bytes(bytes(out))
            self.assertEqual(module.read_png(path), (width, height, rgb))


class DiffRegionTests(unittest.TestCase):
    def make(self, temp, name, width, height, colour):
        path = Path(temp) / name
        write_png(path, width, height, bytes(colour) * (width * height))
        return path

    def test_identical_images_score_zero(self):
        with tempfile.TemporaryDirectory() as temp:
            a = self.make(temp, "a.png", 10, 10, [255, 255, 255])
            b = self.make(temp, "b.png", 10, 10, [255, 255, 255])
            report = module.diff_regions(a, b, [{"id": "r1", "name": "全幅", "x": 0, "y": 0, "width": 10, "height": 10}])
            self.assertEqual(report["overall_diff_ratio"], 0.0)
            self.assertEqual(report["regions"][0]["diff_ratio"], 0.0)

    def test_black_versus_white_scores_one(self):
        with tempfile.TemporaryDirectory() as temp:
            a = self.make(temp, "a.png", 10, 10, [0, 0, 0])
            b = self.make(temp, "b.png", 10, 10, [255, 255, 255])
            report = module.diff_regions(a, b, [{"id": "r1", "name": "全幅", "x": 0, "y": 0, "width": 10, "height": 10}])
            self.assertEqual(report["overall_diff_ratio"], 1.0)

    def test_small_channel_noise_is_ignored_by_threshold(self):
        with tempfile.TemporaryDirectory() as temp:
            a = self.make(temp, "a.png", 4, 4, [100, 100, 100])
            b = self.make(temp, "b.png", 4, 4, [105, 105, 105])
            report = module.diff_regions(a, b, [{"id": "r1", "name": "全幅", "x": 0, "y": 0, "width": 4, "height": 4}])
            self.assertEqual(report["overall_diff_ratio"], 0.0)

    def test_regions_are_sorted_by_diff_desc(self):
        with tempfile.TemporaryDirectory() as temp:
            a = self.make(temp, "a.png", 4, 2, [0, 0, 0])
            path_b = Path(temp) / "b.png"
            # 左半黑、右半白
            rgb = bytearray()
            for _ in range(2):
                rgb += bytes([0, 0, 0]) * 2 + bytes([255, 255, 255]) * 2
            write_png(path_b, 4, 2, bytes(rgb))
            report = module.diff_regions(a, path_b, [
                {"id": "left", "name": "左", "x": 0, "y": 0, "width": 2, "height": 2},
                {"id": "right", "name": "右", "x": 2, "y": 0, "width": 2, "height": 2},
            ])
            self.assertEqual([r["id"] for r in report["regions"]], ["right", "left"])
            self.assertEqual(report["regions"][0]["diff_ratio"], 1.0)

    def test_mismatched_canvas_size_raises(self):
        with tempfile.TemporaryDirectory() as temp:
            a = self.make(temp, "a.png", 4, 4, [0, 0, 0])
            b = self.make(temp, "b.png", 8, 8, [0, 0, 0])
            with self.assertRaises(module.PngError) as ctx:
                module.diff_regions(a, b, [])
            self.assertIn("尺寸不一致", str(ctx.exception))

    def test_out_of_canvas_region_is_skipped_not_crashed(self):
        with tempfile.TemporaryDirectory() as temp:
            a = self.make(temp, "a.png", 4, 4, [0, 0, 0])
            b = self.make(temp, "b.png", 4, 4, [0, 0, 0])
            report = module.diff_regions(a, b, [{"id": "oops", "name": "越界", "x": 10, "y": 10, "width": 5, "height": 5}])
            self.assertEqual(report["regions"], [])
            self.assertEqual(report["skipped"][0]["id"], "oops")

    def test_top_limits_the_ranking(self):
        with tempfile.TemporaryDirectory() as temp:
            a = self.make(temp, "a.png", 6, 1, [0, 0, 0])
            b = self.make(temp, "b.png", 6, 1, [255, 255, 255])
            regions = [{"id": f"r{i}", "name": str(i), "x": i, "y": 0, "width": 1, "height": 1} for i in range(6)]
            report = module.diff_regions(a, b, regions, top=2)
            self.assertEqual(len(report["regions"]), 2)


if __name__ == "__main__":
    unittest.main()
