#!/usr/bin/env python3
"""output/ 资产盘点 · 只读 dry-run 报告（合并计划波4 · P5 一次性 manifest，不建平台）。

    python3 scripts/assets_manifest.py [--out 报告路径.md]

产出：①按角色粗分类统计（source/evidence/derived/cache 启发式）②≥1MB 文件的精确 hash
重复组（清理候选，只报告不删）③嵌套 node_modules/dist 可再生体量。任何清理动作都
须用户按报告批准后另行执行。
"""
import argparse
import hashlib
import sys
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT_DIR = REPO / "output"
SKIP_DIRS = {"node_modules", ".git", "target", "__pycache__", "dist"}


def role_of(p: Path) -> str:
    s = str(p)
    if "node_modules" in s or "/dist/" in s or s.endswith(".pyc"):
        return "cache/可再生"
    if any(k in s for k in ("07-references", "截图", "screenshot", "探索", "images")):
        return "evidence/证据"
    if any(k in s for k in ("05-prd", "README", "_status", "06-prototype")):
        return "source/交付"
    return "其他"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out")
    a = ap.parse_args()

    role_stat = defaultdict(lambda: [0, 0])
    hashes = defaultdict(list)
    nm_bytes = 0
    n_files = 0
    for p in OUT_DIR.rglob("*"):
        if p.is_dir():
            continue
        parts = set(p.parts)
        n_files += 1
        try:
            size = p.stat().st_size
        except OSError:
            continue
        if parts & SKIP_DIRS:
            nm_bytes += size
            continue
        r = role_of(p)
        role_stat[r][0] += 1
        role_stat[r][1] += size
        if size >= 1_000_000:
            try:
                m = hashlib.md5()
                with p.open("rb") as fh:          # 分块流式，防大文件内存峰值
                    for chunk in iter(lambda: fh.read(1 << 20), b""):
                        m.update(chunk)
                hashes[(m.hexdigest(), size)].append(p)
            except OSError:
                continue                            # 读失败跳过该文件，不崩整份报告

    dup_groups = {k: v for k, v in hashes.items() if len(v) > 1}
    dup_waste = sum(size * (len(v) - 1) for (h, size), v in dup_groups.items())

    lines = [f"# output/ 资产盘点报告（只读 · {n_files} 文件）\n",
             "## 角色分布（启发式初分，供清理决策参考）\n",
             "| 角色 | 文件数 | 体量 |", "|---|---|---|"]
    for r, (c, b) in sorted(role_stat.items(), key=lambda x: -x[1][1]):
        lines.append(f"| {r} | {c} | {b/1e9:.2f} GB |")
    lines += [f"\n嵌套 node_modules/dist/target（可再生，不宜留在资产区）：{nm_bytes/1e6:.0f} MB\n",
              f"## ≥1MB 精确重复组：{len(dup_groups)} 组 / 理论可省 {dup_waste/1e6:.0f} MB\n"]
    for (h, size), v in sorted(dup_groups.items(), key=lambda x: -x[0][1] * (len(x[1]) - 1))[:20]:
        lines.append(f"- {size/1e6:.1f}MB × {len(v)}：")
        for f in v[:4]:
            lines.append(f"    - {f.relative_to(REPO)}")
    lines.append("\n**纪律：本报告零删除。清理按角色分批出候选清单 → 用户批准 → 执行 → 读回验证。**")
    report = "\n".join(lines)
    if a.out:
        Path(a.out).write_text(report + "\n", encoding="utf-8")
        print(f"报告已写 {a.out}")
    print("\n".join(lines[:14]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
