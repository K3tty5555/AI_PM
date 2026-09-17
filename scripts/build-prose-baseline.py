#!/usr/bin/env python3
"""从真人手写语料统计文字质量基线，供 check-prose-quality.py 取阈值。

为什么要有这个脚本：阈值不能拍脑袋。「句子多长算长」必须由用户本人和同行
真实写出来的东西决定，否则校验器只是把我的主观偏好固化成规则。

纯度纪律（照搬 memory/user_prd_writing_style.md 的判据，别自创）：
  1. 只收 `_feishu-archive/`（飞书正本导出）和本机 `EXTRA_CORPUS_DIRS` 配的
     历史归档目录——`05-prd/*.md` 大多是本工具 AI 起草的，收进来等于把病当成药。
  2. 修订日志里出现 `AI_PM` 的一律剔除（AI 起草的稀释样本）。
  3. 他人项目整体排除，清单见 memory/user_prd_writing_style.md。

⚠️ 归档目录名和他人项目名都是内部名，**不进版本库**（CLAUDE.md 版本库隐私规范），
   放在 gitignore 的 scripts/.prose-corpus.conf 里，模板见同名 .example。

体裁分档：PM 文档和讲稿的句长要求本来就不同，一刀切会两头不讨好。

用法：
    python3 scripts/build-prose-baseline.py            # 扫描并写 .prose-baseline.json
    python3 scripts/build-prose-baseline.py --dry-run  # 只打印不落盘
    python3 scripts/build-prose-baseline.py --selftest # 离线自测
"""

import argparse
import json
import re
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent
OUT = HERE / ".prose-baseline.json"

CONF = HERE / ".prose-corpus.conf"


def conf(key: str) -> list[str]:
    """读本机语料配置（gitignore）。缺文件返回空——脚本本身不存任何内部名，
    否则检漏脚本自己成泄漏源（本仓踩过这坑，见 .share-denylist 的同款做法）。"""
    if not CONF.exists():
        return []
    for line in CONF.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith(f"{key}="):
            val = line.split("=", 1)[1].strip().strip("\"'")
            return [x for x in val.split("|") if x]
    return []


# 额外的人类正本归档目录（相对 output/projects/）
EXTRA_CORPUS_DIRS = conf("EXTRA_CORPUS_DIRS")
# 他人项目——不学别人的风格（判据单源见 memory/user_prd_writing_style.md）
EXCLUDE_PROJECTS = set(conf("EXCLUDE_PROJECTS"))
# AI 起草标记：修订日志作者列出现即整篇剔除
AI_DRAFT_MARK = "AI_PM"

GENRE_RULES = [
    ("decision-review", re.compile(r"决策评审")),
    ("report", re.compile(r"分析|报告|复盘|汇报")),
    ("prd", re.compile(r".")),  # 兜底
]


def strip_noise(text: str) -> str:
    """只留散文。表格/标题/代码/图片不参与句长统计——它们本来就不是句子。"""
    text = re.sub(r"```.*?```", "", text, flags=re.S)
    text = re.sub(r"!\[.*?\]\(.*?\)", "", text)
    text = re.sub(r"^\s*\|.*$", "", text, flags=re.M)      # 表格行
    text = re.sub(r"^#{1,6} .*$", "", text, flags=re.M)     # 标题
    text = re.sub(r"^\s*[-*+]\s*$", "", text, flags=re.M)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    return text


def sentences(text: str):
    """按中文句末标点切句。保留 >4 字的，短碎片（「是」「对」）无统计意义。"""
    parts = re.split(r"[。！？；\n]", strip_noise(text))
    return [s.strip() for s in parts if len(s.strip()) > 4]


def genre_of(path: Path) -> str:
    name = path.name
    for label, pat in GENRE_RULES:
        if pat.search(name):
            return label
    return "prd"


def is_clean_corpus(path: Path, text: str) -> tuple[bool, str]:
    parts = path.parts
    for p in parts:
        if p in EXCLUDE_PROJECTS:
            return False, f"他人项目({p})"
    if AI_DRAFT_MARK in text:
        return False, "修订日志含 AI_PM（AI 起草稿）"
    if len(strip_noise(text)) < 200:
        return False, "散文太少（可能是纯表格文档）"
    return True, ""


# 软评价尾巴：加了个态度但没加信息的补丁。这是 2026-09-17 对照实验里
# 信号最强的一项——人类 0.04/千字，AI 1.52/千字，差 38 倍。
SOFT_TAIL = [
    "路是通的", "效果不错", "值得关注", "相对来说", "总体而言", "整体来看",
    "较为", "有一定", "起到", "发挥", "还算", "基本可用", "problems不大",
    "是个不错的", "值得一提", "颇为", "略显", "尚可",
]


def measure(text: str) -> dict:
    ss = sentences(text)
    if not ss:
        return {}
    prose = strip_noise(text)
    body = re.sub(r"\s+", "", prose)
    kilo = max(len(body), 1) / 1000
    lens = [len(s) for s in ss]
    # 短句要算进来，切句门槛放到 2 字——「是」「不支持」这类极短句正是人类特征
    all_s = [s.strip() for s in re.split(r"[。！？；\n]", prose) if len(s.strip()) >= 2]
    all_len = [len(s) for s in all_s] or lens
    mean_all = statistics.mean(all_len)
    return {
        # ↓ 2026-09-17 吸收自 swaylq/humanize-chinese（HC3-Chinese 12853 对样本 Cohen's d 校准）
        # 本地 82 份人类语料复现：short_rate d=1.58（论文 1.21）、cv d=0.88（论文 1.22）
        # 这两项比本项目原创的指标强，原有 colon/long_rate（d=0.08/0.19）已淘汰
        "short_rate": sum(1 for x in all_len if x < 10) / len(all_len) * 100,
        "cv": statistics.pstdev(all_len) / mean_all if mean_all else 0.0,
        "sentences": len(ss),
        "mean_len": statistics.mean(lens),
        "median_len": statistics.median(lens),
        "p90_len": sorted(lens)[int(len(lens) * 0.9)] if len(lens) >= 10 else max(lens),
        # ↓ 三项判别式，由对照实验选出（见 docs/plans/2026-09-17-文档质量改造计划.md）
        "dash_per_k": len(re.findall(r"——", prose)) / kilo,
        "soft_per_k": sum(prose.count(w) for w in SOFT_TAIL) / kilo,
    }


def collect():
    globs = [
        ROOT / "output/projects",
    ]
    files = []
    for base in globs:
        if not base.exists():
            continue
        files += list(base.glob("*/05-prd/_feishu-archive/*.md"))
        for d in EXTRA_CORPUS_DIRS:
            files += list((base / d).rglob("*.md"))
    return sorted(set(files))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        return selftest()

    # 纯度靠配置兜着，配置没了就静默变成"学所有人的风格"——必须出声。
    if not CONF.exists():
        print(f"⚠️ 缺 {CONF.name}（模板：{CONF.name}.example）："
              f"不排除他人项目、不收额外归档目录，基线纯度会被稀释", file=sys.stderr)

    by_genre, skipped = {}, []
    for f in collect():
        try:
            text = f.read_text(encoding="utf-8")
        except Exception as e:
            skipped.append((f.name, f"读取失败 {e}"))
            continue
        ok, why = is_clean_corpus(f, text)
        if not ok:
            skipped.append((f.name, why))
            continue
        m = measure(text)
        if not m:
            skipped.append((f.name, "无可统计句子"))
            continue
        by_genre.setdefault(genre_of(f), []).append((f.name, m))

    if not by_genre:
        print("⚠️ 没有收到任何干净语料——基线不生成（fresh clone 时正常）", file=sys.stderr)
        return 0

    baseline = {}
    print(f"{'体裁':16s} {'文档':>4} {'句均长':>7} {'短句占比':>8} {'CV':>7} {'破折号P90':>9}")
    print("-" * 52)
    for genre, items in sorted(by_genre.items()):
        means = [m["mean_len"] for _, m in items]
        p90s = [m["p90_len"] for _, m in items]
        meds = [m["median_len"] for _, m in items]
        def pct(key, q):
            vals = sorted(m[key] for _, m in items)
            return round(vals[min(int(len(vals) * q), len(vals) - 1)] if len(vals) > 3 else max(vals), 2)

        def p75(key):
            return pct(key, 0.75)

        baseline[genre] = {
            "docs": len(items),
            # P75 = 典型上限（多数人类文档在此之下）；P90 = 实际闸线（超了就是离群）
            "dash_per_k_p75": p75("dash_per_k"),
            "dash_per_k_p90": pct("dash_per_k", 0.90),
            "soft_per_k_p75": p75("soft_per_k"),
            "soft_per_k_p90": pct("soft_per_k", 0.90),
            "mean_len_p90": pct("mean_len", 0.90),
            # 阈值取 P75：允许比"典型人类"略长，但不许离谱。
            # 用 P75 而不是均值，是因为少数长文档会把均值拉高，反而放宽了标准。
            "mean_len_p75": round(sorted(means)[int(len(means) * 0.75)] if len(means) > 3 else max(means), 1),
            "short_rate_median": round(statistics.median([m["short_rate"] for _, m in items]), 1),
            "cv_median": round(statistics.median([m["cv"] for _, m in items]), 2),
            "mean_len_median": round(statistics.median(means), 1),
            "median_len_median": round(statistics.median(meds), 1),
            "p90_len_median": round(statistics.median(p90s), 1),
        }
        # 存完整分布：校验器要算"超过了百分之多少的人类文档"，
        # 只存几个分位点算不出分位排名。82 份 × 5 指标的浮点数，体积可忽略。
        baseline[genre]["dist"] = {
            k: sorted(round(m[k], 3) for _, m in items)
            for k in ("short_rate", "cv", "dash_per_k", "mean_len")
        }
        b = baseline[genre]
        print(f'{genre:16s} {b["docs"]:4d} {b["mean_len_median"]:7.1f} '
              f'{b["short_rate_median"]:8.1f}% {b["cv_median"]:7.2f} {b["dash_per_k_p90"]:8.2f}')

    if args.verbose and skipped:
        print(f"\n跳过 {len(skipped)} 份：")
        for n, why in skipped[:15]:
            print(f"  - {n[:46]} → {why}")

    payload = {
        "generated_from": "output/projects/*/05-prd/_feishu-archive"
                          + "".join(f" + {d}" for d in EXTRA_CORPUS_DIRS),
        "purity": "已剔除他人项目与修订日志含 AI_PM 的稀释样本",
        "corpus_docs": sum(len(v) for v in by_genre.values()),
        "skipped": len(skipped),
        "genres": baseline,
    }
    if args.dry_run:
        print("\n--dry-run，未落盘")
        return 0
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n✓ 基线 → {OUT}（{payload['corpus_docs']} 份语料，跳过 {payload['skipped']} 份）")
    return 0


def selftest():
    cases = [
        ("短句文档", "仅做中学电子作业场景的融合。小学场景不在本次范围内。资源统一，入口合并。", True),
        ("超长单句", "这是一个非常长的句子" + "并且还在继续展开说明" * 8 + "最后才说完。", False),
    ]
    ok = True
    for name, text, expect_short in cases:
        m = measure(text)
        got_short = m["mean_len"] < 40
        flag = "✓" if got_short == expect_short else "✗"
        if got_short != expect_short:
            ok = False
        print(f"  {flag} {name}: 句均长 {m['mean_len']:.1f}")

    # 纯度判据必须生效
    p = Path("output/projects/x/05-prd/_feishu-archive/a.md")
    clean, why = is_clean_corpus(p, "修订日志 作者 AI_PM " + "正文" * 200)
    print(f"  {'✓' if not clean else '✗'} AI 起草稿被剔除（{why}）")
    ok &= not clean
    # 排除清单来自本机 conf（gitignore），fresh clone 里必然是空的——所以这里自备
    # fixture 打桩：既不依赖本机配置（否则 fresh-clone 验收必红），也不把真实项目名
    # 写进版本库（CLAUDE.md 版本库隐私规范）。
    global EXCLUDE_PROJECTS
    saved_excl = EXCLUDE_PROJECTS
    EXCLUDE_PROJECTS = {"某他人项目"}
    try:
        clean2, _ = is_clean_corpus(Path("output/projects/某他人项目/05-prd/_feishu-archive/b.md"), "正文" * 200)
        # 阴性：不在清单里的项目必须放行，否则"全剔除"也能骗过上面那条
        clean3, _ = is_clean_corpus(Path("output/projects/自己的项目/05-prd/_feishu-archive/c.md"), "正文" * 200)
    finally:
        EXCLUDE_PROJECTS = saved_excl
    print(f"  {'✓' if not clean2 else '✗'} 他人项目被剔除（排除清单生效）")
    print(f"  {'✓' if clean3 else '✗'} 清单外项目放行（阴性）")
    ok &= clean3
    ok &= not clean2

    print("selftest:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
