#!/usr/bin/env python3
"""
演讲用 HTML 幻灯片质检器。

一次跑完四类检查，全部基于真实浏览器渲染，不靠肉眼：

  1. 版面   越界 / 内容区撑破 / 压住落点（三维，缺一漏检）
  2. 密度   单页字数、总字数、最小正文字号
  3. 语言   业务专名与行话残留、破折号密度（AI 味）
  4. 截图   逐页出图，供人工复核版式

用法：
    python3 check_deck.py deck.html
    python3 check_deck.py deck.html --deny 老卡,三方卡,V1/V2 --shots ./shots
    python3 check_deck.py deck.html --max-chars 180 --min-font 15 --json

退出码：0 = 全部通过；1 = 有阻塞问题（版面或字号）。

依赖：playwright（Python）。浏览器优先复用本机缓存，不联网下载。
"""
import argparse, json, os, sys, glob

# ---- 默认阈值：演讲场景，不是文档场景 ----
DEFAULT_MAX_CHARS = 220      # 单页字数上限（含标点，不含空白）
                             # 表格、卡片这类结构化排版可放宽到 260；整段文字应压到 150 以内
DEFAULT_MIN_FONT = 14.0      # 正文最小字号 px，投影等效 ≥20pt
DEFAULT_VIEWPORTS = [
    ("720p投屏", 1280, 720),   # 会议室最常见，也最矮，最容易溢出
    ("1366x768", 1366, 768),
    ("笔电", 1512, 982),
    ("宽屏", 1920, 1080),
]
# 中文 AI 味的头号特征，超过这个数就该改写
DASH_BUDGET = 2

JS_AUDIT = """() => {
  const s = document.querySelector('.slide.active, [data-slide].active, section.active');
  if (!s) return null;
  const sr = s.getBoundingClientRect();

  // ① 越界：任何元素超出幻灯片下边界
  let out = 0, outWho = '';
  s.querySelectorAll('*').forEach(el => {
    const b = el.getBoundingClientRect();
    if (b.height === 0) return;
    const d = Math.round(b.bottom - sr.bottom);
    if (d > 2 && d > out) { out = d; outWho = (el.className || el.tagName).toString().slice(0, 30); }
  });

  // ② 撑破：内容区被内容顶开（元素没越界，但内部已经溢出）
  const ba = s.querySelector('.body-area, .content, .slide-body');
  const burst = ba ? Math.max(0, ba.scrollHeight - ba.clientHeight) : 0;

  // ③ 压落点：内容区最后一块盖住了底部落点（肉眼可见的重叠，前两项都抓不到）
  const pu = s.querySelector('.punch, .footer-line, .takeaway');
  let overlap = 0;
  if (ba && pu) {
    const k = ba.lastElementChild;
    if (k) overlap = Math.max(0, Math.round(k.getBoundingClientRect().bottom - pu.getBoundingClientRect().top));
  }

  // ④ 最小正文字号：只看叶子节点里的实义文本，跳过角标与操作提示
  let minFont = 999, minWho = '';
  s.querySelectorAll('*').forEach(el => {
    // 眉标、页码、操作提示都是标签，不按正文字号要求
    if (el.closest('.kicker, .hint-key, .kicker-num, .topbar, .controls')) return;
    if (el.children.length) return;
    const t = (el.innerText || '').trim();
    if (t.length <= 3) return;
    const cs = getComputedStyle(el);
    // 等宽字体的短文本是标签（眉标、序号、角色名），不按正文字号要求
    if (/mono|consolas|menlo|courier/i.test(cs.fontFamily) && t.length <= 22) return;
    const f = parseFloat(cs.fontSize);
    if (f < minFont) { minFont = f; minWho = t.slice(0, 14); }
  });

  const txt = (s.innerText || '');
  return {
    title: s.dataset.title || '',
    out, outWho, burst, overlap,
    minFont: minFont === 999 ? null : Math.round(minFont * 10) / 10,
    minWho,
    chars: txt.replace(/\\s+/g, '').length,
  };
}"""


def activate_slide(page, index):
    """Activate a slide even when a custom deck has no progress controls."""
    page.evaluate(
        """index => {
          const slides = [...document.querySelectorAll('.slide, [data-slide], section.slide')];
          const dots = [...document.querySelectorAll('.progress button')];
          if (dots[index]) { dots[index].click(); return; }
          slides.forEach((slide, current) => slide.classList.toggle('active', current === index));
        }""",
        index,
    )


def blocking_count(report, min_font):
    blocking = 0
    for pages in report["viewports"].values():
        for row in pages:
            if row["out"] > 2 or row["burst"] > 2 or row["overlap"] > 2:
                blocking += 1
    base = report["viewports"].get(DEFAULT_VIEWPORTS[0][0], [])
    fonts = [row["minFont"] for row in base if row["minFont"]]
    if fonts and min(fonts) < min_font:
        blocking += 1
    if report["language"]["deny_hits"]:
        blocking += 1
    return blocking


def find_browser():
    """复用本机 playwright 缓存，绝不触发下载。"""
    root = os.path.expanduser("~/Library/Caches/ms-playwright")
    if not os.path.isdir(root):
        root = os.path.expanduser("~/.cache/ms-playwright")
    pats = ["chromium_headless_shell-*/*/chrome-headless-shell",
            "chromium-*/chrome-*/Chromium",
            "chromium-*/chrome-linux/chrome"]
    hits = []
    for p in pats:
        hits += glob.glob(os.path.join(root, p))
    if not hits:
        return None
    # 版本号大的优先
    return sorted(hits)[-1]


def audit(html, viewports, deny, max_chars, min_font, shots_dir):
    from playwright.sync_api import sync_playwright
    from pathlib import Path
    f = Path(html).expanduser()
    if not f.is_file():
        print(f"文件不存在：{html}", file=sys.stderr)
        sib = sorted(x.name for x in f.parent.glob("*.html")) if f.parent.is_dir() else []
        if sib:
            print("同目录下的 html：" + "、".join(sib), file=sys.stderr)
        sys.exit(2)
    url = f.resolve().as_uri()   # 中文路径必须走 as_uri，手拼 file:// 不会转义
    exe = find_browser()
    if not exe:
        print("找不到本机 playwright 浏览器缓存。", file=sys.stderr)
        print("先确认 ~/Library/Caches/ms-playwright 下有 chromium，不要联网重装。", file=sys.stderr)
        sys.exit(2)

    report = {"viewports": {}, "language": {}, "shots": []}
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=exe)
        for name, w, h in viewports:
            pg = b.new_page(viewport={"width": w, "height": h})
            pg.goto(url); pg.wait_for_timeout(500)
            n = pg.evaluate("document.querySelectorAll('.slide, [data-slide], section.slide').length")
            if not n:
                print("没找到幻灯片节点（.slide / [data-slide] / section.slide）", file=sys.stderr)
                sys.exit(2)
            pages = []
            for i in range(n):
                # 隐藏页 innerText 读不到，必须切到前台再量。
                activate_slide(pg, i)
                pg.wait_for_timeout(190)
                r = pg.evaluate(JS_AUDIT)
                if r: pages.append(r)
            report["viewports"][name] = pages
            pg.close()

        # 语言检查与截图只在标准档做一次
        pg = b.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=2)
        pg.goto(url); pg.wait_for_timeout(600)
        full = pg.evaluate("document.body.textContent || ''")
        report["language"] = {
            "deny_hits": sorted({d for d in deny if d and d in full}),
            "dashes": full.count("——"),
        }
        if shots_dir:
            os.makedirs(shots_dir, exist_ok=True)
            stage = pg.query_selector("#stage, .stage, main")
            n = pg.evaluate("document.querySelectorAll('.slide, [data-slide], section.slide').length")
            for i in range(n):
                activate_slide(pg, i)
                pg.wait_for_timeout(330)
                path = os.path.join(shots_dir, f"p{i+1}.png")
                (stage or pg).screenshot(path=path)
                report["shots"].append(path)
        pg.close(); b.close()
    return report


def main():
    ap = argparse.ArgumentParser(description="演讲用 HTML 幻灯片质检")
    ap.add_argument("html")
    ap.add_argument("--deny", default="", help="逗号分隔的禁用词：业务专名、行话、内部代号")
    ap.add_argument("--max-chars", type=int, default=DEFAULT_MAX_CHARS)
    ap.add_argument("--min-font", type=float, default=DEFAULT_MIN_FONT)
    ap.add_argument("--shots", default="", help="截图输出目录，留空则不截")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    deny = [x.strip() for x in a.deny.split(",") if x.strip()]
    rep = audit(a.html, DEFAULT_VIEWPORTS, deny, a.max_chars, a.min_font, a.shots)
    blocking = blocking_count(rep, a.min_font)

    if a.json:
        print(json.dumps(rep, ensure_ascii=False, indent=2))
        sys.exit(0 if blocking == 0 else 1)

    print("\n── 版面 ──")
    for name, pages in rep["viewports"].items():
        bad = []
        for i, r in enumerate(pages, 1):
            issues = []
            if r["out"] > 2: issues.append(f"越界+{r['out']}<{r['outWho']}>")
            if r["burst"] > 2: issues.append(f"撑破+{r['burst']}")
            if r["overlap"] > 2: issues.append(f"压落点+{r['overlap']}")
            if issues: bad.append(f"P{i} " + "/".join(issues))
        print(f"  {name:<10} {'全部通过' if not bad else ' | '.join(bad)}")

    base = rep["viewports"].get(DEFAULT_VIEWPORTS[0][0], [])
    if base:
        fonts = [r["minFont"] for r in base if r["minFont"]]
        chars = [r["chars"] for r in base]
        mn = min(fonts) if fonts else None
        print("\n── 密度 ──")
        print(f"  总字数 {sum(chars)} | 单页最多 {max(chars)} 字（阈值 {a.max_chars}）")
        print(f"  最小正文 {mn}px（阈值 {a.min_font}px）")
        over = [f"P{i+1}:{c}" for i, c in enumerate(chars) if c > a.max_chars]
        if over:
            print(f"  ! 偏满：{' '.join(over)}（结构化排版可放宽；整段文字务必压到 150 内）")
        if mn and mn < a.min_font:
            worst = min((r for r in base if r["minFont"]), key=lambda r: r["minFont"])
            print(f"  ⚠ 字号过小：「{worst['minWho']}」{worst['minFont']}px —— 投影后排看不清")

    lg = rep["language"]
    print("\n── 语言 ──")
    print(f"  禁用词残留：{'无' if not lg['deny_hits'] else lg['deny_hits']}")
    tag = "" if lg["dashes"] <= DASH_BUDGET else f"  ⚠ 超过 {DASH_BUDGET}，是中文 AI 味的头号特征"
    print(f"  破折号 {lg['dashes']} 处{tag}")
    if rep["shots"]:
        print(f"\n── 截图 ── {len(rep['shots'])} 张 → {os.path.dirname(rep['shots'][0])}")
        print("  版式是否好看，脚本判断不了，务必自己翻一遍")

    print("\n结论：" + ("全部通过" if blocking == 0 else f"{blocking} 处待修"))
    sys.exit(0 if blocking == 0 else 1)


if __name__ == "__main__":
    main()
