"""intake 执行器测试：顺序（骨架+初始status→复制→active_prd→bootstrap）/三分支幂等/同名子路径/装载四道闸。"""
import importlib.util, json, sys, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import aipm_core  # noqa: E402
_ap = importlib.util.spec_from_file_location("aipm_intake_apply", ROOT / "scripts/aipm_intake_apply.py")
module = importlib.util.module_from_spec(_ap); assert _ap.loader; _ap.loader.exec_module(module)
_sc = importlib.util.spec_from_file_location("aipm_intake_scan", ROOT / "scripts/aipm_intake_scan.py")
scan_mod = importlib.util.module_from_spec(_sc); assert _sc.loader; _sc.loader.exec_module(scan_mod)

MESSY = ROOT / "tests/fixtures/intake/messy"


def _fake_repo(work: Path) -> Path:
    repo = work / "repo"
    (repo / "output/projects").mkdir(parents=True)
    (repo / "scripts").mkdir()
    for f in ("aipm_contracts.py", "aipm_core.py", "status_migrate.py", "aipm_reconcile.py"):
        src = ROOT / "scripts" / f
        if src.exists():
            (repo / "scripts" / f).write_bytes(src.read_bytes())
    (repo / "templates/configs").mkdir(parents=True)
    (repo / "templates/configs/capability-registry.json").write_text(
        '{"schema_version":1,"modes":[],"capabilities":[]}', encoding="utf-8")
    return repo


class TestApplyProject(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.work = Path(self.tmp.name)
        self.repo = _fake_repo(self.work)
        self.manifest = scan_mod.scan(MESSY, self.work / "_intake", extra_skill_dirs=())
        self.mpath = self.work / "_intake" / self.manifest["intake_id"] / "manifest.json"
        self.cluster_a = next(c for c in self.manifest["clusters"] if c["source_dirs"] == ["项目A"])

    def test_project_roundtrip_order_and_validate(self):
        module.cmd_project(str(self.mpath), [self.cluster_a["cluster_id"]], "项目A",
                           active_prd="需求/PRD-V1.md", repo=self.repo)
        proj = self.repo / "output/projects/项目A"
        status = json.loads((proj / "_status.json").read_text(encoding="utf-8"))
        self.assertEqual(status["active_prd"], "需求/PRD-V1.md")
        self.assertTrue((proj / "05-prd/需求/PRD-V1.md").is_file())
        # 同名子路径保留（I5）：簇内「需求/」「原型/」子目录结构不拍平
        self.assertTrue((proj / "05-prd/需求/备份.md").is_file())
        self.assertTrue((proj / "06-prototype/_imported/原型/index.html").is_file())
        self.assertTrue((proj / "01-baseline-manifest.json").is_file(), "bootstrap 必须已跑")
        errors, _ = aipm_core.validate_status_artifacts(status, proj)
        self.assertEqual(errors, [], f"status 违约: {errors}")

    def test_idempotent_rerun_after_done(self):
        module.cmd_project(str(self.mpath), [self.cluster_a["cluster_id"]], "项目A",
                           active_prd="需求/PRD-V1.md", repo=self.repo)
        out = module.cmd_project(str(self.mpath), [self.cluster_a["cluster_id"]], "项目A",
                                 active_prd="需求/PRD-V1.md", repo=self.repo)
        self.assertIn("已完成，跳过", out)

    def test_interrupted_rerun_resumes(self):
        """I4：done 前中断（目录半成品、manifest 无 done 记录）→ 重走续传，不报「目标已存在」。"""
        module.cmd_project(str(self.mpath), [self.cluster_a["cluster_id"]], "项目A",
                           active_prd="需求/PRD-V1.md", repo=self.repo)
        # 模拟中断：抹掉 done 记录 + 删掉一个已复制文件（留半成品目录）
        m = json.loads(Path(self.mpath).read_text(encoding="utf-8"))
        m["executed_projects"] = []
        Path(self.mpath).write_text(json.dumps(m, ensure_ascii=False), encoding="utf-8")
        (self.repo / "output/projects/项目A/05-prd/需求/PRD-V1.md").unlink()
        out = module.cmd_project(str(self.mpath), [self.cluster_a["cluster_id"]], "项目A",
                                 active_prd="需求/PRD-V1.md", repo=self.repo)
        self.assertIn("续传", out)
        self.assertTrue((self.repo / "output/projects/项目A/05-prd/需求/PRD-V1.md").is_file())

    def test_multi_cluster_merge(self):
        """S2：--cluster-id 可重复，两簇合并为一个项目。"""
        ids = [self.cluster_a["cluster_id"],
               next(c for c in self.manifest["clusters"] if c["source_dirs"] == ["b站调研笔记"])["cluster_id"]]
        module.cmd_project(str(self.mpath), ids, "项目A", active_prd="需求/PRD-V1.md", repo=self.repo)
        proj = self.repo / "output/projects/项目A"
        self.assertTrue((proj / "05-prd/需求/PRD-V1.md").is_file())
        self.assertTrue((proj / "05-prd/notes.md").is_file(), "第二簇的 md 也要落进同项目")

    def test_name_conflict_aborts(self):
        (self.repo / "output/projects/项目A").mkdir()
        with self.assertRaises(SystemExit):
            module.cmd_project(str(self.mpath), [self.cluster_a["cluster_id"]], "项目A", repo=self.repo)

    def test_unsanitized_name_rejected(self):
        """I6：执行器入口设防，未 sanitize 的名字/路径直接拒。"""
        with self.assertRaises(SystemExit):
            module.cmd_project(str(self.mpath), [self.cluster_a["cluster_id"]], "../逃逸", repo=self.repo)
        with self.assertRaises(SystemExit):
            module.cmd_project(str(self.mpath), [self.cluster_a["cluster_id"]], "带:冒号",
                               repo=self.repo)

    def test_active_prd_rejects_traversal(self):
        with self.assertRaises(SystemExit):
            module.cmd_project(str(self.mpath), [self.cluster_a["cluster_id"]], "项目A",
                               active_prd="../x.md", repo=self.repo)

    def test_active_prd_validation_before_side_effects(self):
        """I2：active_prd 校验在任何副作用之前，拒绝后项目目录不存在。"""
        with self.assertRaises(SystemExit):
            module.cmd_project(str(self.mpath), [self.cluster_a["cluster_id"]], "项目A",
                               active_prd="../x.md", repo=self.repo)
        # 验证目录未被创建
        proj = self.repo / "output/projects/项目A"
        self.assertFalse(proj.exists(), "active_prd 校验失败后，项目目录不应被创建")

    def test_active_prd_legal_relative_path(self):
        """I2：合法的相对路径如 a..b.md 应被接受。"""
        # 创建包含 a..b.md 的簇（修改 fixture）
        module.cmd_project(str(self.mpath), [self.cluster_a["cluster_id"]], "项目A",
                           active_prd="需求/a..b.md", repo=self.repo)
        proj = self.repo / "output/projects/项目A"
        status = json.loads((proj / "_status.json").read_text(encoding="utf-8"))
        self.assertEqual(status["active_prd"], "需求/a..b.md")


class TestApplyFinish(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.work = Path(self.tmp.name)
        self.repo = _fake_repo(self.work)
        self.manifest = scan_mod.scan(MESSY, self.work / "_intake", extra_skill_dirs=())
        self.mpath = self.work / "_intake" / self.manifest["intake_id"] / "manifest.json"

    def test_finish_pending_clusters_after_multi_merge(self):
        """I1：两簇合并立项后，cmd_finish 输出含「未处理簇 N」，N = 总簇数 - 2。"""
        cluster_ids = [c["cluster_id"] for c in self.manifest["clusters"][:2]]
        module.cmd_project(str(self.mpath), cluster_ids, "项目A", repo=self.repo)
        out = module.cmd_finish(str(self.mpath))
        total_clusters = len(self.manifest["clusters"])
        expected_pending = total_clusters - 2  # 2 簇已合并成 1 项目
        self.assertIn(f"未处理簇 {expected_pending}", out,
                      f"期望「未处理簇 {expected_pending}」，实际输出: {out}")

    def test_skip_dedup_on_resume(self):
        """Skip 去重：对含凭证文件的簇立项一次、中断后续传重跑，finish 的「跳」计数不增加。"""
        # 找含凭证文件的簇（如有）或根目录散文件簇
        cred_cluster = next((c for c in self.manifest["clusters"]
                             if any(f.get("credential_hit") for f in c["files"])), None)
        if not cred_cluster:
            self.skipTest("Fixture 中无凭证文件簇")
        cluster_id = cred_cluster["cluster_id"]
        name = module.sanitize_name("_".join(cred_cluster["source_dirs"]))

        # 第一次立项
        module.cmd_project(str(self.mpath), [cluster_id], name, repo=self.repo)

        # 模拟中断：清空 executed_projects
        m = json.loads(Path(self.mpath).read_text(encoding="utf-8"))
        skip_count_after_first = 0
        mdir = self.mpath.parent
        if (mdir / "migrated.jsonl").exists():
            for line in (mdir / "migrated.jsonl").read_text(encoding="utf-8").splitlines():
                if line.strip():
                    rec = json.loads(line)
                    if rec.get("action") == "skip":
                        skip_count_after_first += 1
        m["executed_projects"] = []
        Path(self.mpath).write_text(json.dumps(m, ensure_ascii=False), encoding="utf-8")

        # 续传重跑
        module.cmd_project(str(self.mpath), [cluster_id], name, repo=self.repo)

        # 检查 finish 输出中的「跳」数与第一次相同
        out = module.cmd_finish(str(self.mpath))
        import re as regex
        skip_match = regex.search(r"跳 (\d+)", out)
        skip_count_final = int(skip_match.group(1)) if skip_match else 0
        self.assertEqual(skip_count_final, skip_count_after_first,
                         f"续传后「跳」计数不应增加：第一次{skip_count_after_first}，续传后{skip_count_final}")


class TestApplySkill(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.work = Path(self.tmp.name)
        self.repo = self.work / "repo"
        (self.repo / ".claude/skills").mkdir(parents=True)
        (self.repo / "templates/configs").mkdir(parents=True)
        (self.repo / "templates/configs/capability-registry.json").write_text(
            json.dumps({"schema_version": 1, "modes": [], "capabilities": []}), encoding="utf-8")
        (self.repo / ".gitignore").write_text("output/\n", encoding="utf-8")
        (self.work / "helper").mkdir()
        (self.work / "helper/SKILL.md").write_text("---\nname: helper\ndescription: t\n---\n正文\n", encoding="utf-8")

    def test_install_adds_registry_and_gitignore(self):
        module.cmd_skill(self.repo, self.work / "helper", "helper")
        self.assertTrue((self.repo / ".claude/skills/helper/SKILL.md").is_file())
        gi = (self.repo / ".gitignore").read_text(encoding="utf-8")
        self.assertIn(".claude/skills/helper/", gi)
        reg = json.loads((self.repo / "templates/configs/capability-registry.json").read_text(encoding="utf-8"))
        self.assertEqual(reg["capabilities"][0]["skill"], "helper")
        self.assertEqual(reg["capabilities"][0]["availability"], "optional-private")

    def test_install_idempotent_gitignore(self):
        module.cmd_skill(self.repo, self.work / "helper", "helper")
        gi = (self.repo / ".gitignore").read_text(encoding="utf-8")
        self.assertEqual(gi.count(".claude/skills/helper/"), 1)

    def test_existing_target_refuses(self):
        (self.repo / ".claude/skills/helper").mkdir()
        with self.assertRaises(SystemExit):
            module.cmd_skill(self.repo, self.work / "helper", "helper")

    def test_registry_duplicate_refuses(self):
        """R20：装载前复查 registry（运行间隙 registry 可能已被别处改过）。"""
        reg = self.repo / "templates/configs/capability-registry.json"
        reg.write_text(json.dumps({"schema_version": 1, "modes": [],
                                   "capabilities": [{"id": "helper", "skill": "helper"}]}), encoding="utf-8")
        with self.assertRaises(SystemExit):
            module.cmd_skill(self.repo, self.work / "helper", "helper")


if __name__ == "__main__":
    unittest.main()
