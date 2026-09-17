#!/usr/bin/env python3
"""文字质量校验器：拿真人语料的分布当尺子，量 AI 写的文档偏了多少。

背景（2026-09-17 对照实验，82 份人类稿 vs 7 份 AI 起草稿）：
  AI 味不在「因此 / 所以 / 为了」这些连接词上——实测**人类用得比 AI 还多**
  （2.10 vs 1.23 每千字）。按词表抓 AI 腔，方向就错了。

  真正的判别式是三个，全部机器可判：
    ① 软评价尾巴   人类 0.04/千字 → AI 1.52/千字（38 倍）
    ② 破折号铺陈   人类 0.47/千字 → AI 3.04/千字（6.5 倍）
    ③ 长句率       人类 15.9%    → AI 25.0%

  四分之三的人类 PRD 里破折号和软评价是**零**。所以闸线取 P90，
  允许偶尔用，只拦系统性滥用。

阈值来源：scripts/.prose-baseline.json（由 build-prose-baseline.py 生成，
gitignore）。基线缺失时退回内置保守值并明确告知——不静默降级。

用法：
    python3 scripts/check-prose-quality.py <file.md> [...]
    python3 scripts/check-prose-quality.py --selftest
    python3 scripts/check-prose-quality.py --genre report <file.md>
退出码：0 = 过；1 = 有超标项；2 = 用法错误
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).parent
BASELINE = HERE / ".prose-baseline.json"

# 基线缺失时的兜底（fresh clone 场景）。取自 2026-09-17 实测的 prd 档。
FALLBACK = {
    "mean_len_p90": 43.3, "long_rate_p90": 25.0,
    "dash_per_k_p90": 0.86, "soft_per_k_p90": 0.00, "colon_per_k_p90": 13.29,
}

# 软评价尾巴：加了态度没加信息的补丁。已剔除人类语料里出现过的
# （相对来说 / 较为 / 起到），只留真 0 次的。
SOFT_TAIL = [
    "路是通的", "效果不错", "值得关注", "总体而言", "整体来看",
    "有一定", "发挥", "还算", "基本可用",
    "是个不错的", "值得一提", "颇为", "略显", "尚可",
]

# 人类语料里一次都没出现过的词。
# ⚠️ 入表纪律：必须先跑 scripts/build-prose-baseline.py 的语料做 0 次验证再加。
# 2026-09-17 验证被剔除的（以为是 AI 词，实测人类也用）：
#   颗粒度 6 次 / 赋能 1 次 / 相对来说 1 次 / 较为 1 次 / 起到 1 次
AI_ONLY_WORDS = ["接住", "接不住", "承接住", "抓手", "心智"]


def load_baseline(genre: str):
    if not BASELINE.exists():
        return FALLBACK, f"⚠️ 基线缺失（{BASELINE.name}），退回内置保守值；跑 build-prose-baseline.py 生成"
    data = json.loads(BASELINE.read_text(encoding="utf-8"))
    g = data.get("genres", {})
    if genre in g:
        return g[genre], None
    if "prd" in g:
        return g["prd"], f"⚠️ 基线里没有体裁 {genre}，退回 prd 档"
    return FALLBACK, "⚠️ 基线为空，退回内置值"


def strip_noise(text: str) -> str:
    text = re.sub(r"```.*?```", "", text, flags=re.S)
    text = re.sub(r"!\[.*?\]\(.*?\)", "", text)
    text = re.sub(r"^\s*\|.*$", "", text, flags=re.M)
    text = re.sub(r"^#{1,6} .*$", "", text, flags=re.M)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    return text


def sentences(prose: str):
    return [s.strip() for s in re.split(r"[。！？；\n]", prose) if len(s.strip()) > 4]


def genre_of(path: Path) -> str:
    n = path.name
    if "决策评审" in n:
        return "decision-review"
    if re.search(r"分析|报告|复盘|汇报|速览", n):
        return "report"
    return "prd"


def analyze(text: str) -> dict:
    prose = strip_noise(text)
    ss = sentences(prose)
    if not ss:
        return {}
    body = re.sub(r"\s+", "", prose)
    kilo = max(len(body), 1) / 1000
    lens = [len(s) for s in ss]
    # 短句门槛放到 2 字：「是」「不支持」这类极短句正是人类特征，>4 会把它们滤掉
    all_s = [s.strip() for s in re.split(r"[。！？；\n]", prose) if len(s.strip()) >= 2]
    all_len = [len(s) for s in all_s] or lens
    mean_all = statistics.mean(all_len)
    return {
        "chars": len(body),
        "sentences": len(ss),
        "short_rate": sum(1 for x in all_len if x < 10) / len(all_len) * 100,
        "cv": statistics.pstdev(all_len) / mean_all if mean_all else 0.0,
        "mean_len": statistics.mean(lens),
        "long_rate": sum(1 for n in lens if n > 60) / len(lens) * 100,
        "dash_per_k": len(re.findall(r"——", prose)) / kilo,
        "soft_per_k": sum(prose.count(w) for w in SOFT_TAIL) / kilo,
        "_prose": prose,
        "_sents": ss,
    }


def locate(prose: str, sents, m) -> dict:
    """报位置，不只报数字——只给数字，人不知道去改哪里。"""
    hits = {}
    long_s = sorted([s for s in sents if len(s) > 60], key=len, reverse=True)[:3]
    if long_s:
        hits["长句"] = [f"[{len(s)}字] {s[:52]}…" for s in long_s]
    dash = [s.strip()[:56] for s in re.split(r"[。！？\n]", prose) if "——" in s][:3]
    if dash:
        hits["破折号铺陈"] = dash
    soft = []
    for w in SOFT_TAIL:
        for mm in re.finditer(re.escape(w), prose):
            soft.append(f"「{w}」… {prose[mm.start():mm.start()+26]}")
            break
    if soft:
        hits["软评价"] = soft[:4]
    ai = [w for w in AI_ONLY_WORDS if w in prose]
    if ai:
        hits["AI 专属词（人类语料 0 次）"] = ai
    return hits


# (标签, 指标key, 单位, 方向)
#   "high" = 值越高越像 AI（破折号、句均长）
#   "low"  = 值越低越像 AI（短句占比、CV——人类长短句交错，AI 写等长句）
# 效应量 Cohen's d（2026-09-17 本地 82 份人类语料实测）：
#   short_rate 1.58 ｜ dash_per_k 1.44 ｜ cv 0.88 ｜ mean_len 0.46
#   已淘汰：colon_per_k 0.08、long_rate 0.19（基本无判别力）
CHECKS = [
    ("短句占比(<10字)", "short_rate", "%", "low"),
    ("破折号铺陈", "dash_per_k", "/千字", "high"),
    ("句长变异系数CV", "cv", "", "low"),
    ("句均长", "mean_len", "字", "high"),
]

# 判定规则与误报率（82 份人类语料实测）
FAIL_RULE = "≥2 项进人类分布的极端 5%，或 ≥3 项进极端 10%"


def pct_rank(dist, v) -> float:
    """超过了百分之多少的人类文档。严格小于——并列不算超越，
    否则大量取 0 的指标会让每篇文档都显示 100 分位。"""
    if not dist:
        return 0.0
    return sum(1 for x in dist if x < v) / len(dist) * 100


def check_file(path: Path, genre: str | None, quiet=False) -> int:
    text = path.read_text(encoding="utf-8")
    m = analyze(text)
    if not m:
        if not quiet:
            print(f"  ⏭  {path.name}：无可统计散文（纯表格文档），跳过")
        return 0
    g = genre or genre_of(path)
    base, warn = load_baseline(g)
    dists = base.get("dist", {})
    if warn and not quiet:
        print(f"  {warn}")

    print(f"\n── {path.name}（体裁 {g}，散文 {m['chars']} 字 / {m['sentences']} 句"
          f"，对照 {base.get('docs', '?')} 份人类语料）")
    ext5 = ext10 = 0
    for label, key, unit, direction in CHECKS:
        d = dists.get(key, [])
        r = pct_rank(d, m[key])
        # "low" 方向：排名越低越异常，折算成同向的"极端度"
        extreme = (100 - r) if direction == "low" else r
        mark = ""
        if extreme > 95:
            ext5 += 1
            ext10 += 1
            mark = "← 极端 5%"
        elif extreme > 90:
            ext10 += 1
            mark = "← 极端 10%"
        arrow = "↓偏低" if direction == "low" else "↑偏高"
        print(f"   {label:16s} {m[key]:6.2f}{unit:5s} 人类分位 P{r:<5.1f} ({arrow}为病) {mark}")

    ai_hit = [w for w in AI_ONLY_WORDS if w in m["_prose"]]
    if ai_hit:
        print(f"   {'AI 专属词':16s} 命中 {ai_hit}｜这些词在人类语料里 0 次")
    soft_hit = [w for w in SOFT_TAIL if w in m["_prose"]]
    if soft_hit:
        print(f"   {'软评价尾巴':16s} 命中 {soft_hit[:5]}｜删掉不丢任何事实")

    failed = (ext5 >= 2) or (ext10 >= 3) or bool(ai_hit) or bool(soft_hit)
    print(f"   {'✗ 未过' if failed else '✓ 过'}：极端5% {ext5} 项 / 极端10% {ext10} 项"
          f"{'，AI 专属词' if ai_hit else ''}{'，软评价' if soft_hit else ''}｜规则 {FAIL_RULE}")

    if failed and not quiet:
        for k, v in locate(m["_prose"], m["_sents"], m).items():
            print(f"   · {k}：")
            for s in v:
                print(f"       {s}")
    return 1 if failed else 0


def selftest() -> int:
    ok = True
    human = ("仅做中学电子作业场景的融合，小学电子作业场景不在本次讨论范围内。"
             "融合后资源统一，入口合并，流程统一。批改保持现状。"
             "第一阶段范围为题库作业，作文专项放在第二阶段。") * 6
    ai = ("题库的主线是「找」——找题加找卷占到整体的百分之四十三，一半以上的题库使用都在这条线上，"
          "交付率百分之七十四到八十三，路是通的。学情的主线是「查」——学生、班级、名单、题型、"
          "归因、趋势，六类加起来占整体三成，交付率全在七成七以上，总体而言效果不错。") * 6

    hm, am = analyze(human), analyze(ai)
    checks = [
        ("人类样本长句率低", hm["long_rate"] < 20, f"{hm['long_rate']:.1f}%"),
        ("人类样本无破折号", hm["dash_per_k"] == 0, f"{hm['dash_per_k']:.2f}"),
        ("人类样本无软评价", hm["soft_per_k"] == 0, f"{hm['soft_per_k']:.2f}"),
        ("AI 样本破折号远超人类中位", am["dash_per_k"] > 0.58, f"{am['dash_per_k']:.2f}"),
        ("AI 样本软评价超标", am["soft_per_k"] > 0.5, f"{am['soft_per_k']:.2f}"),
        ("AI 样本句更长", am["mean_len"] > hm["mean_len"], f"{am['mean_len']:.1f} vs {hm['mean_len']:.1f}"),
    ]
    for name, cond, got in checks:
        print(f"  {'✓' if cond else '✗'} {name}（{got}）")
        ok &= bool(cond)

    # 定位功能必须报得出位置
    hits = locate(am["_prose"], am["_sents"], am)
    has = "破折号铺陈" in hits and "软评价" in hits
    print(f"  {'✓' if has else '✗'} 能报出具体位置（{list(hits)}）")
    ok &= has

    print("selftest:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*")
    ap.add_argument("--genre", choices=["prd", "report", "decision-review"])
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    if not a.files:
        ap.print_usage()
        return 2
    rc = 0
    for f in a.files:
        p = Path(f)
        if not p.exists():
            print(f"✗ 文件不存在：{f}", file=sys.stderr)
            rc = 2
            continue
        rc |= check_file(p, a.genre, a.quiet)
    return rc


if __name__ == "__main__":
    sys.exit(main())
