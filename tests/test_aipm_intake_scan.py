# tests/test_aipm_intake_scan.py
"""intake 扫描器测试：排除表 / 分类 / 哈希去重 / 凭证 / sanitize / 项目根识别 / 内容标题 / 仓库根排除 / 报告。"""
import importlib.util, json, os, shutil, sys, tempfile, threading, time, zipfile
from types import SimpleNamespace
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("aipm_intake_scan", ROOT / "scripts/aipm_intake_scan.py")
module = importlib.util.module_from_spec(_spec); assert _spec.loader; _spec.loader.exec_module(module)
MESSY = ROOT / "tests/fixtures/intake/messy"
HOME_LIKE = ROOT / "tests/fixtures/intake/home_like"


class TestScan(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        # collision 检测面注入固定空集：测试不绑 ~/.claude/skills 本机状态
        self.manifest = module.scan(MESSY, Path(self.tmp.name), extra_skill_dirs=())

    def files_of(self, klass):
        return [f["path"] for c in self.manifest["clusters"] for f in c["files"] if f["klass"] == klass]

    def test_fixture_intact_then_exclusions(self):
        # fixture 完整性先行断言：任一被 gitignore 静默吞掉，下面的排除断言就是空转
        for rel in ("node_modules/junk/x.js", ".env", ".DS_Store", "fake-aipm-repo/CLAUDE.md",
                    ".zsh_history", "项目A/config.yaml", "项目A/截图.png"):
            self.assertTrue((MESSY / rel).exists(), f"fixture 缺 {rel}（检查 tests/.gitignore 白名单）")
        all_paths = [f["path"] for c in self.manifest["clusters"] for f in c["files"]]
        self.assertFalse(any("node_modules" in p for p in all_paths))
        self.assertFalse(any(".DS_Store" in p for p in all_paths))
        self.assertFalse(any("fake-aipm-repo" in p for p in all_paths), "AI_PM 仓库根必须整棵排除")
        self.assertGreater(self.manifest["scope"]["excluded"]["node_modules"], 0)

    def test_classification(self):
        self.assertTrue(any("PRD-V1.md" in p for p in self.files_of("md")))
        self.assertTrue(any("index.html" in p for p in self.files_of("html")))
        # schema v2：unclassified 只存「按扩展名计数 + 总数」，不逐条
        self.assertEqual(self.manifest["unclassified"],
                         {"total": 5, "by_ext": {"(无扩展名)": 2, ".png": 2, ".yaml": 1}})

    def test_duplicates_detected_by_hash(self):
        dups = self.manifest["duplicates"]
        self.assertEqual(len(dups), 1)
        self.assertEqual(len(dups[0]["paths"]), 2)

    def test_credential_default_skip(self):
        self.assertTrue(any(p.endswith(".env") for p in self.manifest["credential_hits"]))

    def entry(self, rel):
        return next(f for c in self.manifest["clusters"] for f in c["files"] if f["path"] == rel)

    def test_hidden_file_probed_and_marked(self):
        """C2-1：隐藏文件永不迁移，但仍探测凭证进 credential_hits。
        schema v2：未归类的 .env/.zsh_history 不进簇，只在 credential_hits；已归类的隐藏文件进簇带 hidden。"""
        self.assertIn(".zsh_history", self.manifest["credential_hits"])
        self.assertIn(".env", self.manifest["credential_hits"])
        all_paths = {f["path"] for c in self.manifest["clusters"] for f in c["files"]}
        self.assertNotIn(".env", all_paths)
        self.assertFalse(self.entry("项目A/需求/PRD-V1.md")["hidden"])
        with tempfile.TemporaryDirectory() as d:
            r = Path(d) / "r"; (r / "p").mkdir(parents=True)
            (r / "p/a.md").write_text("# a", encoding="utf-8")
            (r / "p/.草稿.md").write_text("# 草稿", encoding="utf-8")
            m = module.scan(r, Path(d) / "_i", extra_skill_dirs=())
            ents = {f["path"]: f for c in m["clusters"] for f in c["files"]}
            self.assertTrue(ents["p/.草稿.md"]["hidden"])
            self.assertFalse(module.will_migrate(ents["p/.草稿.md"]))

    def test_content_probe_yaml(self):
        """C2-3：config.yaml 里的 token 也要探到。"""
        self.assertIn("项目A/config.yaml", self.manifest["credential_hits"])

    def test_cred_name_patterns(self):
        """C2-4：常见凭证/历史文件名直接命中。"""
        for n in (".netrc", ".npmrc", ".pgpass", ".pypirc", ".zsh_history", ".bash_history",
                  ".git-credentials", ".env", ".env.local", "id_rsa"):
            self.assertTrue(module.CRED_NAME_RE.search(n), n)
        self.assertFalse(module.CRED_NAME_RE.search("history.md"))

    def test_content_probe_extensions(self):
        with tempfile.TemporaryDirectory() as d:
            r = Path(d) / "r"; (r / "p").mkdir(parents=True)
            for ext in (".sh", ".toml", ".ini", ".py", ".properties", ".xml", ".conf"):
                (r / "p" / f"x{ext}").write_text(f"secret = {'Q' * 24}{ext}\n", encoding="utf-8")
            m = module.scan(r, Path(d) / "_i", extra_skill_dirs=())
            self.assertEqual(len(m["credential_hits"]), 7, m["credential_hits"])

    def test_doc_klass(self):
        """C2-2：txt/pdf/rtf 是「类型不明的文档」klass=doc，不是 unclassified。"""
        for ext in (".txt", ".pdf", ".rtf"):
            self.assertEqual(module.KLASS_BY_EXT[ext], "doc")

    def test_skill_candidate_detected(self):
        cand = next(s for s in self.manifest["skill_candidates"] if s["name"] == "my-helper")
        self.assertTrue(cand["frontmatter_ok"])
        self.assertEqual(cand["collisions"], [])
        self.assertEqual(cand["status"], "installable")

    def test_prompt_asset(self):
        self.assertTrue(any("PM提示词" in a["path"] for a in self.manifest["prompt_assets"]))

    def test_manifest_stage_and_scope(self):
        self.assertEqual(self.manifest["stage"], "scan")
        self.assertIn("total_files", self.manifest["scope"])

    def test_sanitize(self):
        self.assertEqual(module.sanitize_name(' 项目/:A*?"<>|名 '), "项目-A-名")

    def test_unfinished_listing(self):
        # 独立临时目录：setUp 的 scan 产物 stage=scan 也在本目录的话会混进结果
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "x" / "manifest.json"
            p.parent.mkdir(parents=True)
            p.write_text(json.dumps({"stage": "confirm"}), encoding="utf-8")
            self.assertEqual(module.list_unfinished(Path(d)), [str(p)])

    def test_report_md_written(self):
        report = Path(self.tmp.name) / self.manifest["intake_id"] / "report.md"
        self.assertTrue(report.is_file())
        text = report.read_text(encoding="utf-8")
        self.assertIn("扫描范围", text)
        self.assertIn("未归类", text)
        self.assertIn("prompt", text)                 # R18：能力资产清单进报告
        self.assertIn("复制总量", text)                # R18：总量预估进报告
        # 顺手修：重复文件组列明细（每组列路径）
        dup_paths = self.manifest["duplicates"][0]["paths"]
        for dp in dup_paths:
            self.assertIn(dp, text.split("## 重复文件组", 1)[1])

    def test_same_second_retry_keeps_id_consistent(self):
        """顺手修：同秒重试后 intake_id 与实际目录名一致。"""
        orig = module.time
        module.time = SimpleNamespace(strftime=lambda fmt: "20261009-120000")
        self.addCleanup(setattr, module, "time", orig)
        out = Path(self.tmp.name) / "same"
        a = module.scan(MESSY, out, extra_skill_dirs=())
        b = module.scan(MESSY, out, extra_skill_dirs=())
        self.assertEqual(a["intake_id"], "20261009-120000")
        self.assertEqual(b["intake_id"], "20261009-120000-2")
        on_disk = json.loads((out / b["intake_id"] / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(on_disk["intake_id"], "20261009-120000-2")

    def test_report_lists_conflicts_and_oversize(self):
        with tempfile.TemporaryDirectory() as d:
            r = Path(d) / "r"; (r / "项目A").mkdir(parents=True)
            (r / "项目A/a.md").write_text("a", encoding="utf-8")
            with (r / "项目A/录屏.docx").open("wb") as fh:
                fh.truncate(51 << 20)
            projects = Path(d) / "projects"; (projects / "项目A").mkdir(parents=True)
            m = module.scan(r, Path(d) / "_i", extra_skill_dirs=(), projects_dir=projects)
            self.assertEqual(m["project_name_conflicts"], ["项目A"])
            text = (Path(d) / "_i" / m["intake_id"] / "report.md").read_text(encoding="utf-8")
            self.assertIn("## 项目名撞存量", text)
            self.assertIn("- 项目A", text.split("## 项目名撞存量", 1)[1])
            self.assertIn("项目A/录屏.docx", text.split("## 超大文件", 1)[1])


@unittest.skipIf(hasattr(os, "geteuid") and os.geteuid() == 0, "root 无视 chmod 000")
class TestUnreadable(unittest.TestCase):
    """C3：不可读文件不能让整次扫描崩溃。"""

    def test_unreadable_files_counted_not_raised(self):
        with tempfile.TemporaryDirectory() as d:
            r = Path(d) / "r"
            (r / "p").mkdir(parents=True); (r / "s").mkdir()
            (r / "p" / "a.html").write_text("<p>same</p>", encoding="utf-8")
            locked = r / "p" / "b.html"; locked.write_text("<p>diff</p>", encoding="utf-8")  # 同 size → 走哈希
            skill = r / "s" / "SKILL.md"; skill.write_text("---\ndescription: x\n---\n", encoding="utf-8")
            (r / "p" / "dangling.md").symlink_to(r / "nope.md")
            locked.chmod(0); skill.chmod(0)
            try:
                m = module.scan(r, Path(d) / "_i", extra_skill_dirs=())
            finally:
                locked.chmod(0o644); skill.chmod(0o644)
            self.assertGreaterEqual(m["scope"]["skipped_unreadable"], 3, m["scope"])
            ents = {f["path"]: f for c in m["clusters"] for f in c["files"]}
            self.assertTrue(ents["p/b.html"].get("unreadable"))
            self.assertEqual(m["duplicates"], [])


class TestHomeUsability(unittest.TestCase):
    """I5：真实 macOS 主目录可用性——排除表、只对会迁移的候选算哈希、iCloud dataless 不读内容。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.r = Path(self.tmp.name) / "r"
        self.r.mkdir()

    def put(self, rel, text="x"):
        f = self.r / rel; f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(text, encoding="utf-8")
        return f

    def scan(self):
        return module.scan(self.r, Path(self.tmp.name) / "_i", extra_skill_dirs=())

    def paths(self, m):
        return sorted(f["path"] for c in m["clusters"] for f in c["files"])

    def test_name_and_suffix_exclusions(self):
        for rel in ("X.app/a.md", "照片图库.photoslibrary/b.md", "Foo.bundle/c.md", "Bar.framework/d.md",
                    "Proj.xcodeproj/e.md", "miniconda3/f.md", "anaconda3/g.md", "py/lib/site-packages/h.md",
                    "rs/target/i.md", "ios/Pods/j.md", "php/vendor/k.md", ".cache/l.md", "keep/ok.md"):
            self.put(rel)
        m = self.scan()
        self.assertEqual(self.paths(m), ["keep/ok.md"])
        ex = m["scope"]["excluded"]
        for k in (".app", ".photoslibrary", "miniconda3", "site-packages", "target", "Pods", "vendor"):
            self.assertIn(k, ex, ex)

    def test_dedup_hashes_only_migratable(self):
        (self.r / "p").mkdir()
        for name in ("big1.md", "big2.md"):  # 稀疏文件：秒建 51MB 双胞胎（oversize）
            with (self.r / "p" / name).open("wb") as fh:
                fh.truncate(51 << 20)
        self.put("p/a.png", "same-png"); self.put("p/b.png", "same-png")              # unclassified
        self.put("p/k1.md", f"sk-{'Z9' * 12}"); self.put("p/k2.md", f"sk-{'Z9' * 12}")  # credential
        self.put("p/.h1", "hidden!"); self.put("p/.h2", "hidden!")                     # hidden
        self.put("p/m1.md", "migrate"); self.put("p/m2.md", "migrate")                # 真候选
        m = self.scan()
        ents = {f["path"]: f for c in m["clusters"] for f in c["files"]}
        for rel in ("p/big1.md", "p/big2.md", "p/k1.md", "p/k2.md"):
            self.assertNotIn("sha256", ents[rel], f"{rel} 不会迁移，不该哈希")
        for rel in ("p/a.png", "p/b.png", "p/.h1", "p/.h2"):  # schema v2：未归类不进簇（更不会哈希）
            self.assertNotIn(rel, ents)
        self.assertIn("sha256", ents["p/m1.md"])
        self.assertEqual([sorted(g["paths"]) for g in m["duplicates"]], [["p/m1.md", "p/m2.md"]])

    def test_dataless_not_read(self):
        secret = f"token = {'Q' * 24}"
        self.put("p/cloud.md", secret); self.put("p/local.md", secret.replace("token", "plain"))
        orig = module._stat
        def fake(entry):
            st = orig(entry)
            if entry.name != "cloud.md":
                return st
            return SimpleNamespace(st_size=st.st_size, st_mtime=st.st_mtime, st_flags=0x40000000)
        module._stat = fake
        self.addCleanup(setattr, module, "_stat", orig)
        m = self.scan()
        cloud = next(f for c in m["clusters"] for f in c["files"] if f["path"] == "p/cloud.md")
        self.assertTrue(cloud["dataless"])
        self.assertFalse(cloud["credential_hit"], "dataless 不读内容 → 不做内容探测")
        self.assertNotIn("sha256", cloud)
        self.assertFalse(module.will_migrate(cloud))
        self.assertIn("p/cloud.md", m["dataless"])
        report = (Path(self.tmp.name) / "_i" / m["intake_id"] / "report.md").read_text(encoding="utf-8")
        self.assertIn("云端未下载文件", report)
        self.assertIn("p/cloud.md", report)

    def test_is_dataless_flag(self):
        self.assertTrue(module._is_dataless(SimpleNamespace(st_flags=0x40000000 | 0x20)))
        self.assertFalse(module._is_dataless(SimpleNamespace(st_flags=0x20)))
        self.assertFalse(module._is_dataless(SimpleNamespace()), "非 macOS 无 st_flags")


# ---------- 构造工具（stdlib zipfile 现场造 docx/pptx，不依赖 fixture 文件） ----------

W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
P_NS = ('xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"')
XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'


def put(root: Path, rel: str, data="x") -> Path:
    f = root / rel
    f.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(data, bytes):
        f.write_bytes(data)
    else:
        f.write_text(data, encoding="utf-8")
    return f


def make_docx(path: Path, paras, pad_bytes=0, raw_document=None):
    """paras: 每段一个 run 文本列表（文本可含已转义的 XML 实体）；None = 自闭合空段。
    run 之间插一个 <w:tab/>，防「<w:t[^>]*> 把 <w:tab/> 当文本节点」这类宽松正则。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    body = []
    for runs in paras:
        if runs is None:
            body.append('<w:p w:rsidR="00A1B2C3"/>')
            continue
        rs = '<w:r><w:tab/></w:r>'.join(f'<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">{t}</w:t></w:r>'
                                         for t in runs)
        body.append(f'<w:p w:rsidR="00A1"><w:pPr><w:pStyle w:val="Title"/></w:pPr>{rs}</w:p>')
    filler = ""
    if pad_bytes:
        unit = '<w:p><w:r><w:t>填充正文填充正文填充正文填充正文</w:t></w:r></w:p>'
        filler = unit * (pad_bytes // len(unit.encode("utf-8")) + 1)
    xml = raw_document or f'{XML_HEAD}<w:document {W_NS}><w:body>{"".join(body)}{filler}</w:body></w:document>'
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("word/document.xml", xml)


def sp(text, ph=None):
    nv = f'<p:nvPr><p:ph type="{ph}" idx="0"/></p:nvPr>' if ph else "<p:nvPr/>"
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="2" name="形状"/><p:cNvSpPr/>{nv}</p:nvSpPr><p:spPr/>'
            f'<p:txBody><a:bodyPr/><a:p><a:pPr/><a:r><a:rPr lang="zh-CN"/><a:t>{text}</a:t></a:r></a:p></p:txBody></p:sp>')


def make_pptx(path: Path, slides: dict, order: list):
    """slides: {zip 内路径: slide xml 片段(sp 拼接)}；order: [(r:id, Target)] 即 sldIdLst 顺序。
    rels 按 order 反序写，且 sldMasterIdLst 里先放一个 rId1，专抓「取第一个 r:id」的实现。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    pres = (f'{XML_HEAD}<p:presentation {P_NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/>'
            '</p:sldMasterIdLst><p:sldIdLst>'
            + "".join(f'<p:sldId id="{256 + i}" r:id="{rid}"/>' for i, (rid, _) in enumerate(order))
            + '</p:sldIdLst></p:presentation>')
    rels = ('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="x/slideMaster" Target="slideMasters/slideMaster1.xml"/>'
            + "".join(f'<Relationship Id="{rid}" Type="x/slide" Target="{t}"/>' for rid, t in reversed(order))
            + '</Relationships>')
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("ppt/presentation.xml", pres)
        z.writestr("ppt/_rels/presentation.xml.rels", rels)
        z.writestr("ppt/slideMasters/slideMaster1.xml", f'<p:sldMaster {P_NS}>{sp("母版标题", "title")}</p:sldMaster>')
        for name, body in slides.items():
            z.writestr(name, f'{XML_HEAD}<p:sld {P_NS}><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/>{body}'
                             '</p:spTree></p:cSld></p:sld>')


class TreeCase(unittest.TestCase):
    """在 tmp 里现场造目录树、扫描、按簇断言。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.r = Path(self.tmp.name) / "r"
        self.r.mkdir()
        self.n = 0

    def add(self, *rels):
        for rel in rels:
            self.n += 1
            if rel.endswith(".docx"):
                make_docx(self.r / rel, [[f"文档{self.n}"]])
            elif rel.endswith((".png", ".xlsx")):
                put(self.r, rel, f"bin{self.n}".encode())
            else:
                put(self.r, rel, f"# 文件{self.n}\n")

    def scan(self, **kw):
        out = Path(self.tmp.name) / f"_i{self.n}"
        self.n += 1
        return module.scan(self.r, out, extra_skill_dirs=(), projects_dir=Path(self.tmp.name) / "projects", **kw)

    @staticmethod
    def layout(m):
        return {c["source_dirs"][0]: sorted(f["path"] for f in c["files"]) for c in m["clusters"]}

    @staticmethod
    def by_dir(m):
        return {c["source_dirs"][0]: c for c in m["clusters"]}

    def report(self, m):
        return next(Path(self.tmp.name).glob(f"_i*/{m['intake_id']}/report.md")).read_text(encoding="utf-8")


class TestHomeLikeClusters(TreeCase):
    """改写自 C1 自适应切簇（§9.4）：不再按文件数阈值/深度上限，按内容认项目根。"""

    def setUp(self):
        super().setUp()
        shutil.rmtree(self.r)
        shutil.copytree(HOME_LIKE, self.r)
        for i in range(5):
            (self.r / "Documents/杂物" / f"n{i}.txt").write_text(f"杂物{i}", encoding="utf-8")
        (self.r / "Documents/散落.md").write_text("Documents 层的散文件", encoding="utf-8")

    def test_fixture_intact(self):
        for rel in ("Documents/项目B/需求/PRD.md", "Documents/项目B/原型/index.html", "Documents/杂物/readme.txt"):
            self.assertTrue((HOME_LIKE / rel).is_file(), f"fixture 缺 {rel}")

    def test_project_subdir_becomes_own_cluster(self):
        m = self.scan()
        self.assertEqual(self.layout(m), {
            "Documents": ["Documents/散落.md"],
            "Documents/杂物": sorted(["Documents/杂物/readme.txt"] + [f"Documents/杂物/n{i}.txt" for i in range(5)]),
            "Documents/项目B": ["Documents/项目B/原型/index.html", "Documents/项目B/需求/PRD.md"],
        })
        c = self.by_dir(m)
        self.assertFalse(c["Documents/项目B"]["loose"])
        self.assertEqual(c["Documents/项目B"]["suggested_name"], "项目B")
        self.assertTrue(c["Documents"]["loose"], "容器自身直放产物单独成散文件簇")
        self.assertIn("容器兼项目", c["Documents"]["notes"])
        self.assertTrue(all("big" not in x for x in m["clusters"]), "schema v2 移除 big")

    def test_loose_files_get_own_cluster(self):
        """改写自旧 test_loose_files_get_own_cluster：容器直放文件单独成 loose 簇（v2 另标「容器兼项目」）。"""
        loose = [c for c in self.scan()["clusters"] if c["loose"]]
        self.assertEqual([(c["source_dirs"][0], [f["path"] for f in c["files"]]) for c in loose],
                         [("Documents", ["Documents/散落.md"])])

    def test_no_depth_cap(self):
        deep = self.r / "Deep/a/b/c/d"
        deep.mkdir(parents=True)
        for i in range(5):
            (deep / f"f{i}.md").write_text(f"深{i}", encoding="utf-8")
        m = self.scan()
        self.assertEqual([k for k in self.layout(m) if k.startswith("Deep")], ["Deep/a/b/c/d"],
                         "不设深度上限：项目根在第 5 层就认第 5 层")

    def test_big_cluster_param_accepted_but_ignored(self):
        """改写自旧 test_small_top_dir_not_split：阈值语义已废，big_cluster 形参只为兼容旧调用。"""
        self.assertEqual(self.layout(self.scan(big_cluster=3)), self.layout(self.scan()))


class TestProjectRoots(TreeCase):
    """§1.3 / §9.1 项目根识别：断言具体簇划分。"""

    def test_basic_documents_tree(self):
        self.add("Documents/工作/2025/项目A/需求/x.docx", "Documents/工作/2025/项目A/原型/index.html",
                 "Documents/工作/2025/项目B/方案.md", "Documents/工作/周报.xlsx",
                 "Documents/杂物/a.png", "Documents/杂物/b.png")
        m = self.scan()
        self.assertEqual(self.layout(m), {
            "Documents/工作": ["Documents/工作/周报.xlsx"],
            "Documents/工作/2025/项目A": ["Documents/工作/2025/项目A/原型/index.html",
                                       "Documents/工作/2025/项目A/需求/x.docx"],
            "Documents/工作/2025/项目B": ["Documents/工作/2025/项目B/方案.md"],
        })
        c = self.by_dir(m)
        self.assertTrue(c["Documents/工作"]["loose"])
        self.assertIn("容器兼项目", c["Documents/工作"]["notes"])
        self.assertFalse(c["Documents/工作/2025/项目A"]["loose"])
        self.assertEqual(c["Documents/工作/2025/项目A"]["suggested_name"], "项目A")
        top = m["no_product_dirs"]["top"]
        self.assertIn({"dir": "Documents/杂物", "files": 2}, top)
        self.assertIn("Documents/杂物", self.report(m).split("## 无产物目录", 1)[1])

    def test_part_word_dir_with_project_below_is_container(self):
        self.add("Documents/文档/项目A/需求/a.md", "Documents/文档/项目A/方案.md", "Documents/文档/说明.md")
        m = self.scan()
        self.assertEqual(self.layout(m), {
            "Documents/文档": ["Documents/文档/说明.md"],
            "Documents/文档/项目A": ["Documents/文档/项目A/方案.md", "Documents/文档/项目A/需求/a.md"]},
            "「文档」下有项目根 → 按容器处理，不并入 Documents")
        self.assertTrue(self.by_dir(m)["Documents/文档"]["loose"])

    def test_version_dirs_with_products_are_separate_projects(self):
        self.add("产品/V1/a.md", "产品/V1/b.html", "产品/V2/a.md", "产品/V2/c.html")
        m = self.scan()
        self.assertEqual(self.layout(m), {"产品/V1": ["产品/V1/a.md", "产品/V1/b.html"],
                                          "产品/V2": ["产品/V2/a.md", "产品/V2/c.html"]})
        self.assertEqual(sorted(c["suggested_name"] for c in m["clusters"]), ["产品-V1", "产品-V2"])

    def test_version_dirs_under_part_dir_merge(self):
        self.add("项目C/原型/v1/a.html", "项目C/原型/v2.1/b.html", "项目C/需求.md")
        self.assertEqual(self.layout(self.scan()), {
            "项目C": ["项目C/原型/v1/a.html", "项目C/原型/v2.1/b.html", "项目C/需求.md"]})

    def test_version_dirs_not_merged_when_parent_has_products_or_mixed_siblings(self):
        """§1.3②：父目录自身有直放产物、或有产物的兄弟不全是版本目录 → 版本目录按普通目录处理。"""
        self.add("项目D/原型/总览.html", "项目D/原型/V1/a.html", "项目D/原型/V1/b.html",
                 "项目F/原型/V1/a.html", "项目F/原型/V1/b.html", "项目F/原型/旧稿/c.html", "项目F/原型/旧稿/d.html")
        self.assertEqual(self.layout(self.scan()), {
            "项目D/原型": ["项目D/原型/总览.html"],
            "项目D/原型/V1": ["项目D/原型/V1/a.html", "项目D/原型/V1/b.html"],
            "项目F/原型/V1": ["项目F/原型/V1/a.html", "项目F/原型/V1/b.html"],
            "项目F/原型/旧稿": ["项目F/原型/旧稿/c.html", "项目F/原型/旧稿/d.html"]})

    def test_version_dirs_under_non_part_parent_stay_separate(self):
        """Ruling 23：单独卡 Ruling 19 第三条件——父目录无直放产物、有产物的兄弟全是版本目录，
        但父目录不是部件目录（工作/产品）→ V1/V2 各自成项目；同结构换成部件目录（工作/原型）→ 并入。"""
        self.add("工作/产品/V1/a.md", "工作/产品/V1/b.html", "工作/产品/V2/a.md", "工作/产品/V2/c.html",
                 "工作/原型/V1/x.html", "工作/原型/V2/y.html")
        m = self.scan()
        self.assertEqual(self.layout(m), {
            "工作": ["工作/原型/V1/x.html", "工作/原型/V2/y.html"],
            "工作/产品/V1": ["工作/产品/V1/a.md", "工作/产品/V1/b.html"],
            "工作/产品/V2": ["工作/产品/V2/a.md", "工作/产品/V2/c.html"]})

    def test_part_dir_subfolders_merge_back_into_parent_project(self):
        """Ruling 20：部件目录下按月/按主题分的子目录不切成独立项目，并回部件的父项目（含多层嵌套）。"""
        self.add("项目A/需求/10月/PRD.md", "项目A/需求/11月/PRD.md",
                 "工作/项目C/需求/登录/a.md", "工作/项目C/需求/支付/b.md", "工作/项目C/原型/index.html",
                 "项目D/资料/2025/10月/a.md", "项目D/资料/2025/11月/b.md")
        m = self.scan()
        self.assertEqual(self.layout(m), {
            "项目A": ["项目A/需求/10月/PRD.md", "项目A/需求/11月/PRD.md"],
            "工作/项目C": sorted(["工作/项目C/原型/index.html", "工作/项目C/需求/支付/b.md",
                                "工作/项目C/需求/登录/a.md"]),
            "项目D": ["项目D/资料/2025/10月/a.md", "项目D/资料/2025/11月/b.md"]})
        c = self.by_dir(m)
        self.assertEqual(c["项目A"]["suggested_name"], "项目A")
        self.assertIn("部件目录下子目录已并回", c["项目A"]["notes"])
        self.assertIn("部件目录下子目录已并回", c["项目D"]["notes"])

    def test_ordinary_container_subprojects_stay_separate(self):
        """Ruling 20 反例：普通容器（非部件目录）下的子项目仍各自成簇；扫描根直下的部件目录也不并回。"""
        self.add("项目B/10月/PRD.md", "项目B/11月/PRD.md", "调研/甲/a.md", "调研/乙/b.md")
        m = self.scan()
        self.assertEqual(self.layout(m), {
            "项目B/10月": ["项目B/10月/PRD.md"], "项目B/11月": ["项目B/11月/PRD.md"],
            "调研/乙": ["调研/乙/b.md"], "调研/甲": ["调研/甲/a.md"]})
        self.assertTrue(all("部件目录下子目录已并回" not in c["notes"] for c in m["clusters"]))

    def test_version_regex_negatives(self):
        """D2 改写（Ruling 20 后部件目录下的普通子目录会并回，旧写法分不出正则对错）：
        与真版本目录 V1 并列——Vision/V1abc 若被误认成版本目录，「兄弟全是版本」成立会整体并入 项目E；
        正确识别时 V1 是版本目录、不扁平，部件不做并回，三者各自成项目。"""
        self.add("项目E/原型/Vision/a.html", "项目E/原型/V1abc/b.html", "项目E/原型/Vision/a2.html",
                 "项目E/原型/V1abc/b2.html", "项目E/原型/V1/c.html", "项目E/原型/V1/c2.html")
        self.assertEqual(sorted(self.layout(self.scan())),
                         ["项目E/原型/V1", "项目E/原型/V1abc", "项目E/原型/Vision"])

    def test_part_word_matching(self):
        for name in ("需求", "01_需求", "02 原型", "3.设计", "04-资料", "05、竞品", "Docs", "DESIGN", "prototype"):
            self.assertTrue(module._is_part_dir(name), name)
        for name in ("需求文档", "设计院方案", "docs2", "01_", "2025", "项目A"):
            self.assertFalse(module._is_part_dir(name), name)
        for name in ("V1", "v2", "V1.0", "v2.10.3"):
            self.assertTrue(module._is_version_dir(name), name)
        for name in ("Vision", "V1abc", "2025", "V", "V1.", "版本V1"):
            self.assertFalse(module._is_version_dir(name), name)

    def test_numbered_part_hit_and_wordy_name_miss(self):
        self.add("项目G/01_需求/a.md", "项目G/02_原型/b.html", "项目G/需求文档/c.md", "项目G/需求文档/d.md")
        m = self.scan()
        self.assertEqual(self.layout(m), {
            "项目G": ["项目G/01_需求/a.md", "项目G/02_原型/b.html"],
            "项目G/需求文档": ["项目G/需求文档/c.md", "项目G/需求文档/d.md"]})
        self.assertIn("容器兼项目", self.by_dir(m)["项目G"]["notes"])

    def test_top_level_part_word_not_merged_into_scan_root(self):
        self.add("调研/a.md", "调研/b.md", "根.md")
        m = self.scan()
        self.assertEqual(self.layout(m), {"(根目录散文件)": ["根.md"], "调研": ["调研/a.md", "调研/b.md"]})
        self.assertTrue(self.by_dir(m)["(根目录散文件)"]["loose"])

    def test_siblings_all_parts(self):
        self.add("2025/需求/a.md", "2025/原型/b.html")
        m = self.scan()
        self.assertEqual(self.layout(m), {"2025": ["2025/原型/b.html", "2025/需求/a.md"]})
        self.assertIn("兄弟全是部件", self.by_dir(m)["2025"]["notes"])
        self.assertIn("兄弟全是部件", self.report(m))

    def test_container_also_project(self):
        self.add("项目A/README.md", "项目A/子项目1/需求/a.md", "项目A/子项目1/b.md")
        m = self.scan()
        self.assertEqual(self.layout(m), {"项目A": ["项目A/README.md"],
                                          "项目A/子项目1": ["项目A/子项目1/b.md", "项目A/子项目1/需求/a.md"]})
        c = self.by_dir(m)
        self.assertTrue(c["项目A"]["loose"])
        self.assertFalse(c["项目A/子项目1"]["loose"])
        self.assertIn("容器兼项目", c["项目A"]["notes"])
        self.assertIn("容器兼项目", self.report(m))

    def test_small_leaf_merges_into_parent_project(self):
        self.add("项目H/PRD.md", "项目H/会议纪要/一次.md", "项目H2/PRD.md", "项目H2/专题/a.md", "项目H2/专题/b.md")
        self.assertEqual(self.layout(self.scan()), {
            "项目H": ["项目H/PRD.md", "项目H/会议纪要/一次.md"],
            "项目H2": ["项目H2/PRD.md"],
            "项目H2/专题": ["项目H2/专题/a.md", "项目H2/专题/b.md"]})

    def test_duplicate_names_get_parent_prefix(self):
        self.add("2024/项目A/a.md", "2025/项目A/b.md", "项目Z/a.md", "项目Z/项目Z/b.md", "项目Z/项目Z/c.md")
        names = {c["source_dirs"][0]: c["suggested_name"] for c in self.scan()["clusters"]}
        self.assertEqual(names, {"2024/项目A": "2024-项目A", "2025/项目A": "2025-项目A",
                                 "项目Z": "项目Z", "项目Z/项目Z": "项目Z-项目Z"})
        self.assertEqual(len(set(names.values())), len(names))

    def test_engineering_markers_code_repo(self):
        self.add("repo1/.git/HEAD", "repo1/docs/设计.md", "repo1/README.md",
                 "pkg/package.json", "pkg/说明.md", "pkg/子模块/方案.md", "pkg/子模块/方案2.md", "普通/a.md")
        m = self.scan()
        flags = {c["source_dirs"][0]: c["code_repo"] for c in m["clusters"]}
        self.assertEqual(flags, {"repo1": True, "pkg": True, "pkg/子模块": True, "普通": False})
        sec = self.report(m).split("## 代码仓库内文档", 1)[1]
        self.assertIn("repo1", sec)
        self.assertNotIn("普通", sec)

    def test_unclassified_and_flagged_only_dirs_not_clusters(self):
        self.add("图片/a.png", "图片/b.png")
        put(self.r, "密/k.md", f"api_key = {'A' * 24}")
        put(self.r, "隐/.x.md", "# 隐")
        m = self.scan()
        self.assertEqual(m["clusters"], [])
        self.assertIn("密/k.md", m["credential_hits"])

    def test_score_orders_report(self):
        self.add("小/a.md", "大/a.md", "大/b.html", "大/c.docx")
        m = self.scan()
        c = self.by_dir(m)
        self.assertGreater(c["大"]["score"], c["小"]["score"])
        rep = self.report(m)
        self.assertLess(rep.index("**大**"), rep.index("**小**"))

    def test_report_folds_beyond_30(self):
        for i in range(32):
            self.add(f"p{i:02d}/a.md")
        m = self.scan()
        self.assertEqual(len(m["clusters"]), 32, "manifest 保留全部簇")
        rep = self.report(m)
        self.assertIn("其余小簇 2 个", rep)
        self.assertEqual(rep.count("（c0"), 30)


class TestDeepTrees(TreeCase):
    """§1.1：迭代自底向上，禁止递归；循环符号链接不挂起。"""

    def test_1100_level_dirs_no_recursion_error(self):
        fd = os.open(self.r, os.O_RDONLY)
        try:
            for _ in range(1100):
                os.mkdir("d", dir_fd=fd)
                nfd = os.open("d", os.O_RDONLY, dir_fd=fd); os.close(fd); fd = nfd
            wfd = os.open("底.md", os.O_WRONLY | os.O_CREAT, 0o644, dir_fd=fd)
            os.write(wfd, "# 底".encode()); os.close(wfd)
        finally:
            os.close(fd)
        self.addCleanup(self._flatten_chain, self.r / "d")  # stdlib rmtree 自己是递归的，先逐层拆掉
        self.add("正常/a.md")
        m = self.scan()  # 超 PATH_MAX 的深处计 skipped，不得抛 RecursionError
        self.assertIn("正常", self.layout(m))

    @staticmethod
    def _flatten_chain(top: Path):
        tmp = top.parent / "_flat"
        while (top / "d").is_dir():  # 每轮把第二层提到顶层，路径始终很短
            os.rename(top / "d", tmp); os.rmdir(top); os.rename(tmp, top)
        shutil.rmtree(top)

    def test_deep_tree_under_low_recursion_limit(self):
        """真正卡「递归实现」：400 层（不超 PATH_MAX）+ 压低递归上限，递归实现必抛 RecursionError。"""
        put(self.r, "/".join(["d"] * 400) + "/底.md", "# 底")
        put(self.r, "/".join(["d"] * 400) + "/底2.md", "# 底2")
        old = sys.getrecursionlimit()
        depth = 0
        f = sys._getframe()
        while f:
            depth += 1; f = f.f_back
        sys.setrecursionlimit(depth + 150)
        try:
            m = self.scan()
        finally:
            sys.setrecursionlimit(old)
        self.assertEqual(list(self.layout(m)), ["/".join(["d"] * 400)])

    def test_build_clusters_1500_levels_synthetic(self):
        rel = "/".join(["d"] * 1500)
        raw = [{"path": f"{rel}/{n}.md", "ext": ".md", "klass": "md", "size": 1, "mtime": "2026-01-01T00:00:00",
                "credential_hit": False, "hidden": False, "oversize": False, "dataless": False} for n in ("a", "b")]
        clusters, _ = module._build_clusters(raw, set())
        self.assertEqual([c["source_dirs"][0] for c in clusters], [rel])

    def test_build_clusters_1500_level_part_chain_merges_iteratively(self):
        """1500 层部件目录链逐层并入 → owner 链长 1500；递归的归属查找会 RecursionError。"""
        rel = "p/" + "/".join(["需求"] * 1500)
        raw = [{"path": p, "ext": ".md", "klass": "md", "size": 1, "mtime": "2026-01-01T00:00:00",
                "credential_hit": False, "hidden": False, "oversize": False, "dataless": False}
               for p in (f"{rel}/a.md", "p/b.md")]
        clusters, _ = module._build_clusters(raw, set())
        self.assertEqual([(c["source_dirs"][0], len(c["files"])) for c in clusters], [("p", 2)])

    def test_symlink_loop_does_not_hang(self):
        self.add("环/a.md", "环/b.md")
        (self.r / "环/回环").symlink_to(self.r / "环", target_is_directory=True)
        (self.r / "环/上").symlink_to(self.r, target_is_directory=True)
        box = {}
        t = threading.Thread(target=lambda: box.setdefault("m", self.scan()), daemon=True)
        t.start(); t.join(30)
        self.assertFalse(t.is_alive(), "循环符号链接导致挂起")
        self.assertEqual(self.layout(box["m"]), {"环": ["环/a.md", "环/b.md"]})


class TestTitles(TreeCase):
    """§2 / §9.2：每种格式断言确切标题字符串。"""

    def titles(self, m):
        return {t["path"]: t["title"] for c in m["clusters"] for t in c["titles"]}

    def test_exact_titles_per_format(self):
        put(self.r, "t_md/a.md", "---\ntitle: 前言\n---\n\n正文先于标题\n## 需求文档标题 ##\n# 第二个标题\n")
        put(self.r, "t_md2/a.md", "\n\n   第一行文字  \n第二行\n")
        put(self.r, "t_txt/a.txt", "\n会议纪要 10月\n内容\n")
        put(self.r, "t_html/index.html", "<html><head><meta charset='utf-8'><TITLE lang=zh>原型 &amp; 演示</TITLE></head></html>")
        make_docx(self.r / "t_docx/a.docx", [None, ["  "], ["第一", "段", "A&amp;B &#x4E2D;&#25991;"], ["第二段"]])
        make_docx(self.r / "t_big/a.docx", [["大文档标题"]], pad_bytes=3 << 20)
        make_pptx(self.r / "t_ppt/a.pptx",
                  {"ppt/slides/slide1.xml": sp("按文件名排第一", "ctrTitle"),
                   "ppt/slides/slide2.xml": sp("正文先出现", "body") + sp("真正的第一页", "title")},
                  [("rId9", "slides/slide2.xml"), ("rId8", "/ppt/slides/slide1.xml")])
        make_pptx(self.r / "t_ppt2/a.pptx",
                  {"ppt/slides/slide1.xml": sp("没有标题占位的第一段") + sp("第二段")},
                  [("rId2", "slides/slide1.xml")])
        put(self.r, "t_gbk/a.md", "# 中文标题ＧＢＫ\n正文".encode("gbk"))
        m = self.scan()
        with zipfile.ZipFile(self.r / "t_big/a.docx") as z:
            self.assertGreater(z.getinfo("word/document.xml").file_size, 2 << 20, "构造须超 2MB 才测得到截断")
        self.assertEqual(self.titles(m), {
            "t_md/a.md": "需求文档标题",
            "t_md2/a.md": "第一行文字",
            "t_txt/a.txt": "会议纪要 10月",
            "t_html/index.html": "原型 & 演示",
            "t_docx/a.docx": "第一段A&B 中文",
            "t_big/a.docx": "大文档标题",
            "t_ppt/a.pptx": "真正的第一页",
            "t_ppt2/a.pptx": "没有标题占位的第一段",
            "t_gbk/a.md": "中文标题ＧＢＫ",
        })
        self.assertEqual(m["titles_fallback"], 0)

    def test_filename_fallbacks_counted_not_skipped(self):
        ole = b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1" + b"\x00" * 504
        put(self.r, "f/老格式.doc", ole)
        put(self.r, "f/加密.docx", ole)
        put(self.r, "f/坏包.docx", b"PK\x03\x04" + b"\x00" * 60)
        put(self.r, "f/周报.xlsx", b"PK\x03\x04xlsx")
        put(self.r, "g/报告.pdf", b"%PDF-1.4 \xff\xfe")
        bomb = ('<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">'
                + "".join(f'<!ENTITY lol{i} "{("&lol" + str(i - 1) + ";") * 10 if i > 1 else "&lol;" * 10}">'
                          for i in range(1, 10))
                + f']><w:document {W_NS}><w:body><w:p><w:r><w:t>&lol9;</w:t></w:r></w:p></w:body></w:document>')
        make_docx(self.r / "g/炸弹.docx", [], raw_document=bomb)
        t0 = time.monotonic()
        m = self.scan()
        self.assertLess(time.monotonic() - t0, 10)
        self.assertEqual(self.titles(m), {"f/老格式.doc": "老格式.doc", "f/加密.docx": "加密.docx",
                                          "f/坏包.docx": "坏包.docx", "f/周报.xlsx": "周报.xlsx",
                                          "g/报告.pdf": "报告.pdf", "g/炸弹.docx": "炸弹.docx"})
        self.assertEqual(m["titles_fallback"], 6)
        self.assertEqual(m["scope"]["skipped_unreadable"], 0, "标题兜底不计不可读")

    def test_adversarial_inputs_bounded(self):
        """恶意构造（未闭合标签成片、超长 # 行）不能让正则回溯成平方级把扫描卡死。"""
        unclosed = f"{XML_HEAD}<w:document {W_NS}><w:body>" + "<w:p><w:r><w:t>" * 60000
        make_docx(self.r / "a1/坏段落.docx", [], raw_document=unclosed)
        make_pptx(self.r / "a2/坏幻灯.pptx", {"ppt/slides/slide1.xml": "<p:sp><a:p><a:t>" * 60000},
                  [("rId2", "slides/slide1.xml")])
        put(self.r, "a3/index.html", "<title>" * 150000)
        put(self.r, "a4/a.md", "# " + " " * 300000 + "#" * 300000 + "x\n")
        put(self.r, "a5/a.txt", "&#" + "9" * 500000 + ";\n")
        t0 = time.monotonic()
        m = self.scan()
        self.assertLess(time.monotonic() - t0, 20)
        titles = self.titles(m)
        self.assertEqual(titles["a1/坏段落.docx"], "坏段落.docx")
        self.assertEqual(titles["a3/index.html"], "index.html")
        self.assertEqual(len(titles["a4/a.md"]), 80)

    def test_undecodable_text_falls_back_to_filename(self):
        """§2.4：utf-8 → gb18030 都解不了 → 文件名，计 titles_fallback、不计不可读。"""
        put(self.r, "u/乱码.txt", b"\xff\xfe\xff\x80\x80\xff\n")
        put(self.r, "u/乱码.md", b"# \xff\xff\xff\n")
        m = self.scan()
        self.assertEqual(self.titles(m), {"u/乱码.txt": "乱码.txt", "u/乱码.md": "乱码.md"})
        self.assertEqual(m["titles_fallback"], 2)
        self.assertEqual(m["scope"]["skipped_unreadable"], 0)

    def test_no_xml_etree(self):
        """§2.2：本机 expat 无 billion laughs 防护，标题抽取绝不能走 xml.etree/minidom/expat。"""
        # Ruling 24：抽取逻辑拆到 aipm_intake_titles，两份源码都查（只查 scan 的话守门对拆出去的代码空转）
        for rel in ("scripts/aipm_intake_scan.py", "scripts/aipm_intake_titles.py"):
            src = (ROOT / rel).read_text(encoding="utf-8")
            code = "\n".join(l.split("#", 1)[0] for l in src.splitlines())  # 只看代码，不看注释
            self.assertIn("zipfile" if rel.endswith("titles.py") else "aipm_intake_titles", code, rel)
            for banned in ("xml.etree", "ElementTree", "minidom", "xml.dom", "expat", "xml.sax", "lxml"):
                self.assertNotIn(banned, code, rel)

    def test_zip_members_read_bounded_not_trusting_file_size(self):
        """§2.2：成员一律 zf.open(name).read(LIMIT+1)；不信 ZipInfo.file_size、不整读成员。"""
        make_docx(self.r / "b/a.docx", [["有界读取"]], pad_bytes=3 << 20)
        make_pptx(self.r / "b/a.pptx", {"ppt/slides/slide1.xml": sp("幻灯标题", "title")},
                  [("rId2", "slides/slide1.xml")])
        sizes = []
        orig_read = zipfile.ZipExtFile.read
        def spy_read(self_f, n=-1):
            sizes.append(n)
            return orig_read(self_f, n)
        zipfile.ZipExtFile.read = spy_read
        self.addCleanup(setattr, zipfile.ZipExtFile, "read", orig_read)
        orig_zread = zipfile.ZipFile.read
        def no_whole_read(*a, **k):
            raise AssertionError("不得 ZipFile.read 整读成员")
        zipfile.ZipFile.read = no_whole_read
        self.addCleanup(setattr, zipfile.ZipFile, "read", orig_zread)
        m = self.scan()
        self.assertEqual(self.titles(m), {"b/a.docx": "有界读取", "b/a.pptx": "幻灯标题"})
        self.assertTrue(sizes)
        self.assertTrue(all(n == module.TITLE_READ_LIMIT + 1 for n in sizes), sizes)

    def test_zip_member_cap(self):
        p = self.r / "z/多成员.docx"; p.parent.mkdir(parents=True)
        with zipfile.ZipFile(p, "w") as z:
            z.writestr("word/document.xml", f"<w:document {W_NS}><w:body><w:p><w:r><w:t>不该读到</w:t></w:r></w:p></w:body></w:document>")
            for i in range(2001):
                z.writestr(f"x/{i}", "")
        self.assertEqual(self.titles(self.scan()), {"z/多成员.docx": "多成员.docx"})

    def test_credential_hidden_dataless_never_titled(self):
        put(self.r, "项目K/需求.md", "# 正常标题")
        put(self.r, "项目K/密钥.md", f"# 机密标题甲\napi_key = {'A' * 24}\n")
        make_docx(self.r / "项目K/credentials.docx", [["机密标题乙"]])
        put(self.r, "项目K/.隐藏.md", "# 机密标题丙")
        put(self.r, "项目K/云端.md", "# 机密标题丁")
        put(self.r, "项目K/泄露.txt", f"sk-{'Ab1' * 10}\n")  # 标题文本本身像密钥 → 内容探测已拦
        orig = module._stat
        def fake(entry):
            st = orig(entry)
            if entry.name != "云端.md":
                return st
            return SimpleNamespace(st_size=st.st_size, st_mtime=st.st_mtime, st_flags=0x40000000)
        module._stat = fake
        self.addCleanup(setattr, module, "_stat", orig)
        m = self.scan()
        c = self.by_dir(m)["项目K"]
        self.assertEqual([t["title"] for t in c["titles"]], ["正常标题"])
        dumped = json.dumps(m["clusters"], ensure_ascii=False) + self.report(m)
        for leak in ("机密标题甲", "机密标题乙", "机密标题丙", "机密标题丁", "Ab1Ab1"):
            self.assertNotIn(leak, dumped)

    def test_title_sanitized(self):
        put(self.r, "s1/a.md", "# 第一*重点*_强调_ [链接](u) `码` | 表 <b>\x07尾‮巴 #\n")
        put(self.r, "s2/index.html", "<title>第一行\r\n第二行\t\x00完</title>")
        put(self.r, "s3/a.md", "# " + "长" * 100)
        m = self.scan()
        self.assertEqual(self.titles(m), {"s1/a.md": "第一*重点*_强调_ [链接](u) `码` | 表 <b>尾巴",
                                          "s2/index.html": "第一行 第二行 完",
                                          "s3/a.md": "长" * 80})
        rep = self.report(m)
        self.assertIn(r"第一\*重点\*\_强调\_ \[链接\](u) \`码\` \| 表 \<b\>尾巴", rep)
        self.assertNotIn("第一*重点*", rep)
        self.assertIn("第一行 第二行 完", rep)

    def test_cluster_titles_cap_5_newest_first(self):
        for i in range(1, 8):
            f = put(self.r, f"多/f{i}.md", f"# 标题{i}")
            os.utime(f, (1_700_000_000 + i * 100, 1_700_000_000 + i * 100))
        self.assertEqual([t["title"] for t in self.by_dir(self.scan())["多"]["titles"]],
                         ["标题7", "标题6", "标题5", "标题4", "标题3"])

    def test_md_read_once_for_probe_and_title(self):
        put(self.r, "一/a.md", "# 只读一次")
        reads = []  # Path.read_bytes/read_text 都经 Path.open，盯 open 即可
        orig_open = Path.open
        def spy_open(self_p, *a, **k):
            reads.append(self_p.name)
            return orig_open(self_p, *a, **k)
        Path.open = spy_open
        self.addCleanup(setattr, Path, "open", orig_open)
        m = self.scan()
        self.assertEqual(self.titles(m), {"一/a.md": "只读一次"})
        self.assertEqual(reads.count("a.md"), 1, reads)


class TestManifestV2(TreeCase):
    """D1↔D2 接口契约：schema_version 2 / scan_rules / no_product_dirs / titles_fallback / 簇字段。"""

    def test_top_level_and_cluster_fields(self):
        self.add("项目A/需求/a.md", "项目A/b.png", "杂/x.png", "杂/y.png", "杂/z.png")
        m = self.scan()
        self.assertEqual(m["schema_version"], 2)
        rules = m["scan_rules"]
        self.assertEqual(rules["part_dir_words"], list(module.PART_DIR_WORDS))
        self.assertIn("需求", rules["part_dir_words"])
        self.assertEqual(rules["version_dir_regex"], module.VERSION_DIR_RE.pattern)
        self.assertIn(".git", rules["engineering_markers"])
        self.assertEqual(m["no_product_dirs"], {"top": [{"dir": "杂", "files": 3}], "total_dirs": 1, "total_files": 3})
        self.assertEqual(m["titles_fallback"], 0)
        self.assertEqual(m["unclassified"], {"total": 4, "by_ext": {".png": 4}})
        c = m["clusters"][0]
        self.assertEqual(set(c), {"cluster_id", "source_dirs", "suggested_name", "loose", "code_repo", "notes",
                                  "files", "newest_mtime", "titles", "score"})
        self.assertEqual(c["files"][0]["path"], "项目A/需求/a.md")
        for k in ("hidden", "credential_hit", "dataless", "oversize"):
            self.assertIn(k, c["files"][0])
        on_disk = next(Path(self.tmp.name).glob(f"_i*/{m['intake_id']}/manifest.json")).read_text(encoding="utf-8")
        self.assertNotIn('"_title"', on_disk, "内部临时键不得落盘")

    def test_no_product_dirs_top10(self):
        for i in range(12):
            for j in range(i + 1):
                self.add(f"空{i:02d}/{j}.png")
        m = self.scan()
        npd = m["no_product_dirs"]
        self.assertEqual(npd["total_dirs"], 12)
        self.assertEqual(npd["total_files"], sum(range(1, 13)))
        self.assertEqual([d["dir"] for d in npd["top"]], [f"空{i:02d}" for i in range(11, 1, -1)])


if __name__ == "__main__":
    unittest.main()
