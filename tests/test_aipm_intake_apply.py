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
