#!/usr/bin/env python3
"""
related-scan —— 开工前关联扫描（精确机制：只按项目名 token 匹配，不做语义猜测）

用途：开始一个项目/场景的活之前，先扫 output/projects/ 里跟当前主题
**同名 token** 的兄弟项目，避免"旁边就有对口项目却从零拼现状"（AI_PM 已知高频坑）。

边界（诚实）：
- 高精度、低召回——只抓名字撞上的（如 考试答题卡 ↔ 考试扫描/考试阅卷/考试工具箱）。
- 名字没撞但语义相关的（如 学情/现网学情产品、竞品分析），本扫描**不覆盖**，
  那一类靠「牵动链」卡（templates/knowledge-base/chains/，suggest 召回）补。

用法：
  python3 scripts/related-scan.py "<当前项目名或主题关键词>"
  python3 scripts/related-scan.py --latest   # 自动取最近修改的项目当主题（hook 用，避开 shell 对中文名的乱码）
"""
import sys, os, re

PROJ_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "output", "projects")


def latest_project():
    cands = [(os.path.getmtime(os.path.join(PROJ_DIR, d)), d)
             for d in os.listdir(PROJ_DIR)
             if os.path.isdir(os.path.join(PROJ_DIR, d)) and not d.startswith(".")]
    return max(cands)[1] if cands else None


def grams(s, nmin=2, nmax=4):
    s = re.sub(r"[^一-鿿A-Za-z0-9]", "", s)
    out = set()
    for n in range(nmin, nmax + 1):
        for i in range(len(s) - n + 1):
            out.add(s[i:i + n])
    return out


def main():
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        print('用法: related-scan.py "<当前项目名/主题>"', file=sys.stderr)
        sys.exit(2)
    if not os.path.isdir(PROJ_DIR):
        print("(output/projects 不存在)")
        return
    arg = sys.argv[1].strip()
    topic = latest_project() if arg == "--latest" else arg
    if not topic:
        return
    tg = grams(topic)
    projects = [d for d in sorted(os.listdir(PROJ_DIR))
                if os.path.isdir(os.path.join(PROJ_DIR, d)) and not d.startswith(".")]
    hits = []
    for p in projects:
        if p == topic:
            continue
        shared = {g for g in (tg & grams(p)) if len(g) >= 2}
        if shared:
            longest = max(shared, key=len)
            hits.append((len(longest), len(shared), p, longest))
    if not hits:
        print(f"（output/projects 里没有跟「{topic}」同名 token 的兄弟项目）")
        return
    hits.sort(reverse=True)
    print(f"⚠️ 开工前关联扫描 ——「{topic}」的同主题兄弟项目（开工前先 ls 一眼，别从零拼现状）：")
    for _, _, p, tok in hits:
        print(f"  · {p}   (共享「{tok}」)")
    print(f"\n共 {len(hits)} 个。名字撞上≠内容一定相关，但相关概率高。"
          f"语义相关但名字没撞的（如学情/竞品），靠牵动链卡补，本扫描不负责。")


if __name__ == "__main__":
    main()
