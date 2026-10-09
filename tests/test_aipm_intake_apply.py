"""intake 执行器测试：顺序（骨架+初始status→复制→active_prd→bootstrap）/三分支幂等/同名子路径/装载四道闸。"""
import importlib.util, json, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import aipm_core  # noqa: E402
_ap = importlib.util.spec_from_file_location("aipm_intake_apply", ROOT / "scripts/aipm_intake_apply.py")
module = importlib.util.module_from_spec(_ap); assert _ap.loader; _ap.loader.exec_module(module)
_sc = importlib.util.spec_from_file_location("aipm_intake_scan", ROOT / "scripts/aipm_intake_scan.py")
scan_mod = importlib.util.module_from_spec(_sc); assert _sc.loader; _sc.loader.exec_module(scan_mod)

MESSY = ROOT / "tests/fixtures/intake/messy"
HOME_LIKE = ROOT / "tests/fixtures/intake/home_like"


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
    # verify 要跑假仓自己的 status_migrate --validate，它按脚本位置解析这两份
    for rel in ("templates/project-index/status.schema.json", "templates/configs/workflow-phases.json"):
        (repo / rel).parent.mkdir(parents=True, exist_ok=True)
        (repo / rel).write_bytes((ROOT / rel).read_bytes())
    return repo


def _inject_claims(proj: Path, prd_rel: str) -> None:
    """模拟 Claude 的 claims 提炼（字段结构与 SKILL.md「claims 提炼」节一致）。"""
    bp = proj / "01-baseline-manifest.json"
    b = json.loads(bp.read_text(encoding="utf-8"))
    b["claims"] = [{"claim_id": "scope.current", "kind": "current-fact", "statement": "已有 PRD",
                    "risk": "medium", "state": "active", "source_ids": ["source.prd"], "aliases": []}]
    b["sources"] = [{"source_id": "source.prd", "kind": "current-product",
                     "path_or_remote_id": prd_rel, "observed_at": "2026-10-09", "authority": "confirmed"}]
    bp.write_text(json.dumps(b, ensure_ascii=False, indent=1), encoding="utf-8")


def _entry(mpath: Path, name: str) -> dict:
    return next(e for e in json.loads(Path(mpath).read_text(encoding="utf-8"))["executed_projects"]
                if e["name"] == name)


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

    def test_credentials_hidden_unclassified_not_copied(self):
        """C2：凭证命中/隐藏/未归类一律不进项目目录，且留 skip 痕。"""
        module.cmd_project(str(self.mpath), [self.cluster_a["cluster_id"]], "项目A",
                           active_prd="需求/PRD-V1.md", repo=self.repo)
        root_c = next(c for c in self.manifest["clusters"] if c["source_dirs"] == ["(根目录散文件)"])
        module.cmd_project(str(self.mpath), [root_c["cluster_id"]], "散文件", repo=self.repo)
        names = {p.name for p in (self.repo / "output/projects").rglob("*") if p.is_file()}
        for leaked in ("config.yaml", "截图.png", ".zsh_history", ".env", "家庭照片.png"):
            self.assertNotIn(leaked, names)
        recs = [json.loads(l) for l in (self.mpath.parent / "migrated.jsonl").read_text(encoding="utf-8").splitlines()]
        skipped = {Path(r["source_abs"]).name for r in recs if r["action"] == "skip"}
        self.assertTrue({"config.yaml", "截图.png", ".zsh_history", ".env", "家庭照片.png"} <= skipped, skipped)

    def test_idempotent_rerun_after_done(self):
        module.cmd_project(str(self.mpath), [self.cluster_a["cluster_id"]], "项目A",
                           active_prd="需求/PRD-V1.md", repo=self.repo)
        _inject_claims(self.repo / "output/projects/项目A", "05-prd/需求/PRD-V1.md")
        module.cmd_verify(str(self.mpath), "项目A", repo=self.repo)
        out = module.cmd_project(str(self.mpath), [self.cluster_a["cluster_id"]], "项目A",
                                 active_prd="需求/PRD-V1.md", repo=self.repo)
        self.assertIn("已完成，跳过", out)

    def test_project_marks_copied_not_done(self):
        """I3：project 只写 copied，done 留给 verify。"""
        module.cmd_project(str(self.mpath), [self.cluster_a["cluster_id"]], "项目A",
                           active_prd="需求/PRD-V1.md", repo=self.repo)
        e = _entry(self.mpath, "项目A")
        self.assertTrue(e["copied"])
        self.assertNotIn("done", e)
        out = module.cmd_project(str(self.mpath), [self.cluster_a["cluster_id"]], "项目A",
                                 active_prd="需求/PRD-V1.md", repo=self.repo)
        self.assertIn("已复制，待补 claims 后跑 verify", out)

    def test_verify_gates_done_on_claims(self):
        """I3：未补 claims → verify 失败不写 done；补上 → 通过写 done；之后 project 跳过。"""
        module.cmd_project(str(self.mpath), [self.cluster_a["cluster_id"]], "项目A",
                           active_prd="需求/PRD-V1.md", repo=self.repo)
        with self.assertRaises(SystemExit) as cm:
            module.cmd_verify(str(self.mpath), "项目A", repo=self.repo)
        self.assertIn("claims 为空", str(cm.exception))
        self.assertNotIn("done", _entry(self.mpath, "项目A"))
        _inject_claims(self.repo / "output/projects/项目A", "05-prd/需求/PRD-V1.md")
        out = module.cmd_verify(str(self.mpath), "项目A", repo=self.repo)
        self.assertIn("通过", out)
        self.assertTrue(_entry(self.mpath, "项目A")["done"])
        again = module.cmd_project(str(self.mpath), [self.cluster_a["cluster_id"]], "项目A",
                                   active_prd="需求/PRD-V1.md", repo=self.repo)
        self.assertIn("已完成，跳过", again)

    def test_verify_cli_nonzero_on_failure(self):
        module.cmd_project(str(self.mpath), [self.cluster_a["cluster_id"]], "项目A",
                           active_prd="需求/PRD-V1.md", repo=self.repo)
        r = subprocess.run([sys.executable, str(ROOT / "scripts/aipm_intake_apply.py"), "verify",
                            "--manifest", str(self.mpath), "--name", "项目A", "--repo", str(self.repo)],
                           capture_output=True, text=True)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("claims", r.stderr)

    def test_done_name_with_different_clusters_aborts(self):
        """顺手修：同名已 done 但这次 cluster_ids 不同 → 报错并列出已登记的 cluster_ids。"""
        cid = self.cluster_a["cluster_id"]
        module.cmd_project(str(self.mpath), [cid], "项目A", active_prd="需求/PRD-V1.md", repo=self.repo)
        _inject_claims(self.repo / "output/projects/项目A", "05-prd/需求/PRD-V1.md")
        module.cmd_verify(str(self.mpath), "项目A", repo=self.repo)
        other = next(c["cluster_id"] for c in self.manifest["clusters"] if c["cluster_id"] != cid)
        with self.assertRaises(SystemExit) as cm:
            module.cmd_project(str(self.mpath), [cid, other], "项目A", repo=self.repo)
        self.assertIn(cid, str(cm.exception))

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
        """I2：合法的相对路径如 a..b.md 应被接受（文件真实存在）。"""
        src = self.work / "messy_copy"
        shutil.copytree(MESSY, src)
        (src / "项目A/需求/a..b.md").write_text("# a..b\n", encoding="utf-8")
        m = scan_mod.scan(src, self.work / "_intake2", extra_skill_dirs=())
        mpath = self.work / "_intake2" / m["intake_id"] / "manifest.json"
        cid = next(c["cluster_id"] for c in m["clusters"] if c["source_dirs"] == ["项目A"])
        module.cmd_project(str(mpath), [cid], "项目A", active_prd="需求/a..b.md", repo=self.repo)
        proj = self.repo / "output/projects/项目A"
        status = json.loads((proj / "_status.json").read_text(encoding="utf-8"))
        self.assertEqual(status["active_prd"], "需求/a..b.md")

    def test_active_prd_must_exist_after_copy(self):
        """I2：active_prd 指向复制后不存在的文件 → 停项，并列出 05-prd 下实际有的 md。"""
        with self.assertRaises(SystemExit) as cm:
            module.cmd_project(str(self.mpath), [self.cluster_a["cluster_id"]], "项目A",
                               active_prd="需求/不存在.md", repo=self.repo)
        self.assertIn("需求/PRD-V1.md", str(cm.exception))
        status = json.loads((self.repo / "output/projects/项目A/_status.json").read_text(encoding="utf-8"))
        self.assertNotIn("active_prd", status)
        self.assertEqual(json.loads(self.mpath.read_text(encoding="utf-8"))["executed_projects"], [])


class TestApplyHomeLike(unittest.TestCase):
    """C1：全盘扫描切出 Documents/项目B 后，能单独立项且不夹带杂物。"""

    def test_project_from_multi_segment_cluster(self):
        with tempfile.TemporaryDirectory() as d:
            work = Path(d)
            repo = _fake_repo(work)
            home = work / "home"
            shutil.copytree(HOME_LIKE, home)
            for i in range(5):
                (home / "Documents/杂物" / f"n{i}.txt").write_text(f"杂物{i}", encoding="utf-8")
            m = scan_mod.scan(home, work / "_intake", extra_skill_dirs=(), big_cluster=3)
            mpath = work / "_intake" / m["intake_id"] / "manifest.json"
            cid = next(c["cluster_id"] for c in m["clusters"]
                       if c["source_dirs"][0] == "Documents/项目B" and not c.get("loose"))
            module.cmd_project(str(mpath), [cid], "项目B", active_prd="需求/PRD.md", repo=repo)
            proj = repo / "output/projects/项目B"
            self.assertTrue((proj / "05-prd/需求/PRD.md").is_file(), "多段前缀须正确剥离")
            self.assertTrue((proj / "06-prototype/_imported/原型/index.html").is_file())
            copied = sorted(p.relative_to(proj).as_posix() for p in proj.rglob("*")
                            if p.is_file() and p.parts[len(proj.parts)] in
                            ("05-prd", "06-prototype", "07-references", "08-reviews", "09-analytics"))
            self.assertEqual(copied, ["05-prd/需求/PRD.md", "06-prototype/_imported/原型/index.html"])
            self.assertFalse(any("杂物" in p.as_posix() for p in proj.rglob("*")))
            # C2-2：已归属项目、类型不明的文档（txt）进 07-references/intake-raw/
            zid = next(c["cluster_id"] for c in m["clusters"] if c["source_dirs"][0] == "Documents/杂物")
            module.cmd_project(str(mpath), [zid], "杂物", repo=repo)
            self.assertTrue((repo / "output/projects/杂物/07-references/intake-raw/readme.txt").is_file())


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
        out0 = module.cmd_finish(str(self.mpath))
        self.assertIn(f"未处理簇 {len(self.manifest['clusters'])}", out0, "只复制未 verify 的不算已处理")
        _inject_claims(self.repo / "output/projects/项目A", "README.md")
        module.cmd_verify(str(self.mpath), "项目A", repo=self.repo)
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


class TestStageDecide(unittest.TestCase):
    """I4：manifest 不靠手工 Edit——stage 改阶段、decide 追加 decisions.jsonl，project 消费 exclude。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.work = Path(self.tmp.name)
        self.repo = _fake_repo(self.work)
        self.src = self.work / "src"
        shutil.copytree(MESSY, self.src)
        (self.src / "项目A/需求/密钥说明.md").write_text(f"key: sk-{'A1b2' * 6}\n", encoding="utf-8")
        self.m = scan_mod.scan(self.src, self.work / "_intake", extra_skill_dirs=())
        self.mpath = self.work / "_intake" / self.m["intake_id"] / "manifest.json"
        self.cid = next(c["cluster_id"] for c in self.m["clusters"] if c["source_dirs"] == ["项目A"])
        self.proj = self.repo / "output/projects/项目A"

    def cli(self, *args):
        return subprocess.run([sys.executable, str(ROOT / "scripts/aipm_intake_apply.py"), *args,
                               "--manifest", str(self.mpath)], capture_output=True, text=True)

    def test_stage_rewrites_manifest(self):
        r = self.cli("stage", "--to", "confirm")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(json.loads(self.mpath.read_text(encoding="utf-8"))["stage"], "confirm")
        module.cmd_stage(str(self.mpath), "exec")
        self.assertEqual(json.loads(self.mpath.read_text(encoding="utf-8"))["stage"], "exec")

    def test_decide_exclude_file_and_dir(self):
        r = self.cli("decide", "--path", "项目A/需求/备份.md", "--action", "exclude")
        self.assertEqual(r.returncode, 0, r.stderr)
        module.cmd_decide(str(self.mpath), "项目A/原型", "exclude")
        lines = (self.mpath.parent / "decisions.jsonl").read_text(encoding="utf-8").splitlines()
        self.assertEqual(len(lines), 2)
        self.assertIn("ts", json.loads(lines[0]))
        module.cmd_project(str(self.mpath), [self.cid], "项目A", active_prd="需求/PRD-V1.md", repo=self.repo)
        self.assertTrue((self.proj / "05-prd/需求/PRD-V1.md").is_file())
        self.assertFalse((self.proj / "05-prd/需求/备份.md").exists())
        self.assertFalse((self.proj / "06-prototype/_imported/原型/index.html").exists())
        recs = [json.loads(l) for l in (self.mpath.parent / "migrated.jsonl").read_text(encoding="utf-8").splitlines()]
        self.assertTrue(any(r["action"] == "skip" and r["decision"] == "exclude"
                            and r["source_abs"].endswith("备份.md") for r in recs))

    def test_credential_file_needs_explicit_confirm(self):
        """spec §3：凭证命中默认跳过，用户逐个显式 confirm 该文件才纳入。"""
        self.assertIn("项目A/需求/密钥说明.md", self.m["credential_hits"])
        module.cmd_project(str(self.mpath), [self.cid], "项目A", active_prd="需求/PRD-V1.md", repo=self.repo)
        self.assertFalse((self.proj / "05-prd/需求/密钥说明.md").exists())
        shutil.rmtree(self.proj)
        m = json.loads(self.mpath.read_text(encoding="utf-8")); m["executed_projects"] = []
        self.mpath.write_text(json.dumps(m, ensure_ascii=False), encoding="utf-8")
        module.cmd_decide(str(self.mpath), "项目A/需求/密钥说明.md", "confirm")
        module.cmd_decide(str(self.mpath), "项目A/config.yaml", "confirm")  # 未归类：confirm 也不迁
        module.cmd_project(str(self.mpath), [self.cid], "项目A", active_prd="需求/PRD-V1.md", repo=self.repo)
        self.assertTrue((self.proj / "05-prd/需求/密钥说明.md").is_file())
        self.assertFalse(any(p.name == "config.yaml" for p in self.proj.rglob("*")))

    def test_decide_rename_validation(self):
        with self.assertRaises(SystemExit):
            module.cmd_decide(str(self.mpath), "项目A", "rename")
        with self.assertRaises(SystemExit):
            module.cmd_decide(str(self.mpath), "项目A", "rename", final_name="带:冒号")
        module.cmd_decide(str(self.mpath), "项目A", "rename", final_name="新名")
        rec = json.loads((self.mpath.parent / "decisions.jsonl").read_text(encoding="utf-8").splitlines()[-1])
        self.assertEqual((rec["action"], rec["final_name"]), ("rename", "新名"))


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


class TestApplySkillCLI(unittest.TestCase):
    """I1：skill 子命令 --path 取 manifest 候选值（SKILL.md 路径），越界/非候选一律拒。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.work = Path(self.tmp.name)
        self.repo = self.work / "repo"
        (self.repo / ".claude/skills").mkdir(parents=True)
        (self.repo / "templates/configs").mkdir(parents=True)
        (self.repo / "templates/configs/capability-registry.json").write_text(
            json.dumps({"schema_version": 1, "modes": [], "capabilities": []}), encoding="utf-8")
        (self.repo / ".gitignore").write_text("output/\n", encoding="utf-8")
        self.src = self.work / "src"
        shutil.copytree(MESSY, self.src)
        (self.work / "secret.txt").write_text("外部机密", encoding="utf-8")
        (self.src / "my-helper/link.txt").symlink_to(self.work / "secret.txt")
        self.m = scan_mod.scan(self.src, self.work / "_intake", extra_skill_dirs=())
        self.mpath = self.work / "_intake" / self.m["intake_id"] / "manifest.json"

    def run_cli(self, path, name="my-helper"):
        return subprocess.run([sys.executable, str(ROOT / "scripts/aipm_intake_apply.py"), "skill",
                               "--manifest", str(self.mpath), "--path", path, "--name", name,
                               "--repo", str(self.repo)], capture_output=True, text=True)

    def test_install_candidate_via_cli(self):
        r = self.run_cli("my-helper/SKILL.md")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        target = self.repo / ".claude/skills/my-helper"
        self.assertTrue((target / "SKILL.md").is_file())
        self.assertTrue((target / "link.txt").is_symlink(), "copytree 不得跟随 symlink")
        rec = json.loads((self.mpath.parent / "migrated.jsonl").read_text(encoding="utf-8").splitlines()[-1])
        self.assertEqual(rec["action"], "install-skill")
        self.assertEqual(rec["source_abs"], str((self.src / "my-helper").resolve()))

    def test_traversal_rejected(self):
        r = self.run_cli("../src/my-helper/SKILL.md")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("不在 manifest.skill_candidates", r.stderr)
        self.assertFalse((self.repo / ".claude/skills/my-helper").exists())

    def test_non_candidate_rejected(self):
        r = self.run_cli("项目A/需求/PRD-V1.md", name="x")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("不在 manifest.skill_candidates", r.stderr)
        self.assertFalse((self.repo / ".claude/skills/x").exists())

    def test_candidate_outside_root_rejected(self):
        """候选清单被篡改也挡得住：resolve 后必须在 manifest.root 之下。"""
        outside = self.work / "outside"; outside.mkdir()
        (outside / "SKILL.md").write_text("---\ndescription: x\n---\n", encoding="utf-8")
        m = json.loads(self.mpath.read_text(encoding="utf-8"))
        m["skill_candidates"].append({"path": "../outside/SKILL.md", "name": "outside", "frontmatter_ok": True,
                                      "collisions": [], "status": "installable"})
        self.mpath.write_text(json.dumps(m, ensure_ascii=False), encoding="utf-8")
        r = self.run_cli("../outside/SKILL.md", name="outside")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("越出扫描根", r.stderr)
        self.assertFalse((self.repo / ".claude/skills/outside").exists())


if __name__ == "__main__":
    unittest.main()
