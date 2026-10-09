# tests/test_aipm_intake_scan.py
"""intake 扫描器测试：排除表 / 分类 / 哈希去重 / 凭证 / sanitize / 簇聚合 / 仓库根排除 / 报告。"""
import importlib.util, json, os, shutil, tempfile
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
        self.assertTrue(any("家庭照片.png" in f["path"] for f in self.manifest["unclassified"]))

    def test_duplicates_detected_by_hash(self):
        dups = self.manifest["duplicates"]
        self.assertEqual(len(dups), 1)
        self.assertEqual(len(dups[0]["paths"]), 2)

    def test_credential_default_skip(self):
        self.assertTrue(any(p.endswith(".env") for p in self.manifest["credential_hits"]))

    def entry(self, rel):
        return next(f for c in self.manifest["clusters"] for f in c["files"] if f["path"] == rel)

    def test_hidden_file_probed_and_marked(self):
        """C2-1：隐藏文件永不迁移，但仍探测凭证进 credential_hits。"""
        self.assertIn(".zsh_history", self.manifest["credential_hits"])
        self.assertTrue(self.entry(".zsh_history")["hidden"])
        self.assertTrue(self.entry(".env")["hidden"])
        self.assertFalse(self.entry("项目A/需求/PRD-V1.md")["hidden"])

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
        for rel in ("p/big1.md", "p/big2.md", "p/a.png", "p/b.png", "p/k1.md", "p/k2.md", "p/.h1", "p/.h2"):
            self.assertNotIn("sha256", ents[rel], f"{rel} 不会迁移，不该哈希")
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


class TestAdaptiveClusters(unittest.TestCase):
    """C1：全盘扫描时一级目录（Documents）是杂物堆，必须自适应切到「项目B」这一层。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name) / "home"
        shutil.copytree(HOME_LIKE, self.home)
        for i in range(5):  # 杂物 > 阈值 3，且无子目录 → 不再切、也不标 big
            (self.home / "Documents/杂物" / f"n{i}.txt").write_text(f"杂物{i}", encoding="utf-8")
        (self.home / "Documents/散落.md").write_text("Documents 层的散文件", encoding="utf-8")

    def scan(self, **kw):
        return module.scan(self.home, Path(self.tmp.name) / "_intake", extra_skill_dirs=(), big_cluster=3, **kw)

    def test_fixture_intact(self):
        for rel in ("Documents/项目B/需求/PRD.md", "Documents/项目B/原型/index.html", "Documents/杂物/readme.txt"):
            self.assertTrue((HOME_LIKE / rel).is_file(), f"fixture 缺 {rel}")

    def test_project_subdir_becomes_own_cluster(self):
        m = self.scan()
        by_dir = {c["source_dirs"][0]: c for c in m["clusters"] if not c.get("loose")}
        self.assertIn("Documents/项目B", by_dir, f"簇: {sorted(by_dir)}")
        c = by_dir["Documents/项目B"]
        self.assertEqual(sorted(f["path"] for f in c["files"]),
                         ["Documents/项目B/原型/index.html", "Documents/项目B/需求/PRD.md"])
        self.assertFalse(c["big"])
        self.assertEqual(c["suggested_name"], "项目B")
        self.assertNotIn("Documents", by_dir, "切分后不应再有整个 Documents 的大簇")
        self.assertFalse(by_dir["Documents/杂物"]["big"], "无子目录可切的平铺目录不标 big")

    def test_loose_files_get_own_cluster(self):
        m = self.scan()
        loose = [c for c in m["clusters"] if c.get("loose") and c["source_dirs"][0] == "Documents"]
        self.assertEqual(len(loose), 1)
        self.assertEqual([f["path"] for f in loose[0]["files"]], ["Documents/散落.md"])

    def test_depth_cap_marks_big(self):
        deep = self.home / "Deep/a/b/c/d"
        deep.mkdir(parents=True)
        for i in range(5):
            (deep / f"f{i}.md").write_text(f"深{i}", encoding="utf-8")
        m = self.scan()
        deep_clusters = [c for c in m["clusters"] if c["source_dirs"][0].startswith("Deep")]
        self.assertEqual([c["source_dirs"][0] for c in deep_clusters], ["Deep/a/b/c"],
                         "相对扫描根 4 层封顶")
        self.assertTrue(deep_clusters[0]["big"], "封顶仍超阈值且含子目录 → big")

    def test_small_top_dir_not_split(self):
        m = module.scan(self.home, Path(self.tmp.name) / "_intake2", extra_skill_dirs=())
        dirs = [c["source_dirs"][0] for c in m["clusters"]]
        self.assertEqual(dirs, ["Documents"], "默认阈值 200 下小目录不切")


if __name__ == "__main__":
    unittest.main()
