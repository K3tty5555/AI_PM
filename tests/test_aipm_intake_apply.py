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
                     "path_or_remote_id": prd_rel, "observed_at": "2026-10-09", "authority": "candidate"}]
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
        """C2：凭证命中/隐藏/未归类一律不进项目目录。
        scan schema v2：未归类文件（.env/.zsh_history/png/yaml）扫描阶段就不进簇（只在 credential_hits /
        unclassified 计数里），扫描根因此也没有散文件簇——apply 根本拿不到它们。"""
        module.cmd_project(str(self.mpath), [self.cluster_a["cluster_id"]], "项目A",
                           active_prd="需求/PRD-V1.md", repo=self.repo)
        names = {p.name for p in (self.repo / "output/projects").rglob("*") if p.is_file()}
        for leaked in ("config.yaml", "截图.png", ".zsh_history", ".env", "家庭照片.png"):
            self.assertNotIn(leaked, names)
        in_clusters = {Path(f["path"]).name for c in self.manifest["clusters"] for f in c["files"]}
        self.assertFalse({"config.yaml", "截图.png", ".zsh_history", ".env", "家庭照片.png"} & in_clusters)
        self.assertTrue({".env", ".zsh_history", "项目A/config.yaml"} <= set(self.manifest["credential_hits"]))

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
        with self.assertRaises(SystemExit) as cm:  # D2：带上 --reason，确保拦下它的是组合比对而不是缺理由
            module.cmd_project(str(self.mpath), [cid, other], "项目A", repo=self.repo, reason="r")
        self.assertIn(cid, str(cm.exception))
        self.assertIn("已登记", str(cm.exception))

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
        """S2：--cluster-id 可重复，两簇合并为一个项目。
        D2 改写（§3.1/§3.2）：多簇必须带 --reason 并登记；落位以最终文件集的最长公共目录前缀剥离——
        项目A 与 b站调研笔记 的公共前缀是扫描根，两簇各自保留顶层目录名，不再按簇 source_dirs[0] 拍平。"""
        ids = [self.cluster_a["cluster_id"],
               next(c for c in self.manifest["clusters"] if c["source_dirs"] == ["b站调研笔记"])["cluster_id"]]
        with self.assertRaises(SystemExit) as cm:
            module.cmd_project(str(self.mpath), ids, "项目A", active_prd="项目A/需求/PRD-V1.md", repo=self.repo)
        self.assertIn("--reason", str(cm.exception))
        module.cmd_project(str(self.mpath), ids, "项目A", active_prd="项目A/需求/PRD-V1.md", repo=self.repo,
                           reason="调研笔记是项目A的前期材料")
        proj = self.repo / "output/projects/项目A"
        self.assertTrue((proj / "05-prd/项目A/需求/PRD-V1.md").is_file())
        self.assertTrue((proj / "05-prd/b站调研笔记/notes.md").is_file(), "第二簇的 md 也要落进同项目")
        self.assertEqual(_entry(self.mpath, "项目A")["reason"], "调研笔记是项目A的前期材料")

    def test_name_conflict_aborts(self):
        (self.repo / "output/projects/项目A").mkdir()
        with self.assertRaises(SystemExit):
            module.cmd_project(str(self.mpath), [self.cluster_a["cluster_id"]], "项目A", repo=self.repo)

    def test_name_conflict_foreign_status_untouched(self):
        """顺手修：目标有 _status.json 但 notes 无 intake 标记（别人的项目）→ 拒绝且原目录一字不动。"""
        proj = self.repo / "output/projects/项目A"; proj.mkdir()
        (proj / "_status.json").write_text(json.dumps({"project": "项目A", "notes": "人工建的"},
                                                      ensure_ascii=False), encoding="utf-8")
        (proj / "README.md").write_text("原有内容", encoding="utf-8")
        before = {p.relative_to(proj).as_posix(): p.read_bytes() for p in proj.rglob("*") if p.is_file()}
        with self.assertRaises(SystemExit):
            module.cmd_project(str(self.mpath), [self.cluster_a["cluster_id"]], "项目A",
                               active_prd="需求/PRD-V1.md", repo=self.repo)
        after = {p.relative_to(proj).as_posix(): p.read_bytes() for p in proj.rglob("*")}
        self.assertEqual(after, before)

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
        """I1：两簇合并立项后，cmd_finish 输出含「未处理簇 N」，N = 总簇数 - 2。
        D2 改写（§5）：簇级只作展示——簇内文件全部已迁或已决定不迁才算已处理；
        「只复制未 verify」不再拖住簇计数，改由「已 copy 未 verify 的项目 P 个」单列。"""
        cluster_ids = [c["cluster_id"] for c in self.manifest["clusters"][:2]]
        module.cmd_project(str(self.mpath), cluster_ids, "项目A", repo=self.repo, reason="合并两簇")
        total_clusters = len(self.manifest["clusters"])
        out0 = module.cmd_finish(str(self.mpath))
        self.assertIn(f"未处理簇 {total_clusters - 2}", out0)
        self.assertIn("已 copy 未 verify 的项目 1 个", out0)
        _inject_claims(self.repo / "output/projects/项目A", "README.md")
        module.cmd_verify(str(self.mpath), "项目A", repo=self.repo)
        out = module.cmd_finish(str(self.mpath))
        self.assertIn(f"未处理簇 {total_clusters - 2}", out)
        self.assertIn("已 copy 未 verify 的项目 0 个", out)

    def test_skip_dedup_on_resume(self):
        """Skip 去重：对含凭证文件的簇立项一次、中断后续传重跑，finish 的「跳」计数不增加。"""
        # scan schema v2：messy 里的凭证文件（.env/.zsh_history/config.yaml）都是未归类、不进簇，
        # 这里补一个凭证命中的 md（与 TestStageDecide 同法）造出「含凭证文件的簇」
        src = self.work / "src"
        shutil.copytree(MESSY, src)
        (src / "项目A/需求/密钥说明.md").write_text(f"key: sk-{'A1b2' * 6}\n", encoding="utf-8")
        self.manifest = scan_mod.scan(src, self.work / "_intake_cred", extra_skill_dirs=())
        self.mpath = self.work / "_intake_cred" / self.manifest["intake_id"] / "manifest.json"
        cred_cluster = next((c for c in self.manifest["clusters"]
                             if any(f.get("credential_hit") for f in c["files"])), None)
        self.assertIsNotNone(cred_cluster, "必须含凭证簇（项目A/需求/密钥说明.md）")
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

        # D2 改写（§5）：finish 按文件对账，「不迁」按候选文件计、天然不随续传重复的 skip 行增长
        out = module.cmd_finish(str(self.mpath))
        import re as regex
        skip_match = regex.search(r"不迁 (\d+)", out)
        self.assertIsNotNone(skip_match, out)
        self.assertEqual(skip_count_after_first, 1, "第一次立项只有密钥说明.md 一条 skip")
        self.assertEqual(int(skip_match.group(1)), 1,
                         f"续传后「不迁」计数不应增加：第一次 {skip_count_after_first}，输出 {out}")


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
        """D2 改写（§4）：exclude 只收候选清单里的文件路径；目录前缀被拒（提示 skip-cluster），不写 decisions。"""
        r = self.cli("decide", "--path", "项目A/需求/备份.md", "--action", "exclude")
        self.assertEqual(r.returncode, 0, r.stderr)
        with self.assertRaises(SystemExit) as cm:
            module.cmd_decide(str(self.mpath), "项目A/原型", "exclude")
        self.assertIn("skip-cluster", str(cm.exception))
        lines = (self.mpath.parent / "decisions.jsonl").read_text(encoding="utf-8").splitlines()
        self.assertEqual(len(lines), 1)
        self.assertIn("ts", json.loads(lines[0]))
        module.cmd_project(str(self.mpath), [self.cid], "项目A", active_prd="需求/PRD-V1.md", repo=self.repo)
        self.assertTrue((self.proj / "05-prd/需求/PRD-V1.md").is_file())
        self.assertFalse((self.proj / "05-prd/需求/备份.md").exists())
        self.assertTrue((self.proj / "06-prototype/_imported/原型/index.html").is_file(), "被拒的目录 exclude 不生效")
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

    def test_decide_skip_consumed_by_project(self):
        """Ruling 27：文件级 decide skip 落地——project 不复制该文件、migrated 记 skip、finish「不迁」含它。"""
        module.cmd_decide(str(self.mpath), "项目A/需求/备份.md", "skip")
        module.cmd_project(str(self.mpath), [self.cid], "项目A", active_prd="需求/PRD-V1.md", repo=self.repo)
        self.assertFalse((self.proj / "05-prd/需求/备份.md").exists())
        self.assertTrue((self.proj / "05-prd/需求/PRD-V1.md").is_file())
        recs = [json.loads(l) for l in (self.mpath.parent / "migrated.jsonl").read_text(encoding="utf-8").splitlines()]
        self.assertTrue(any(r["action"] == "skip" and r["decision"] == "skip"
                            and r["source_abs"].endswith("备份.md") for r in recs))
        self.assertIn("迁 2 / 不迁 2 / 未决定 4", module.cmd_finish(str(self.mpath)))

    def test_copied_shortcircuit_lists_late_exclude_skip(self):
        """Ruling 28：copied 短路不改行为，但 exclude/skip 命中已复制文件时返回消息逐条点名。"""
        module.cmd_project(str(self.mpath), [self.cid], "项目A", active_prd="需求/PRD-V1.md", repo=self.repo)
        out = module.cmd_project(str(self.mpath), [self.cid], "项目A", active_prd="需求/PRD-V1.md", repo=self.repo)
        self.assertIn("已复制，待补 claims 后跑 verify", out)
        self.assertNotIn("不会撤销", out)  # 无交集：不带提示
        module.cmd_decide(str(self.mpath), "项目A/需求/PRD-V1.md", "exclude")
        module.cmd_decide(str(self.mpath), "项目A/需求/密钥说明.md", "skip")  # 未被复制（凭证拦截）：不点名
        out = module.cmd_project(str(self.mpath), [self.cid], "项目A", active_prd="需求/PRD-V1.md", repo=self.repo)
        self.assertIn("不会撤销", out)
        self.assertIn("项目A/需求/PRD-V1.md", out)
        self.assertNotIn("密钥说明", out)

    def test_decide_rename_removed_and_legacy_rows_inert(self):
        """Ruling 27：rename 已废（改名在执行时用 --name）——decide 收到 rename 按非法动作报错、不落盘；
        旧 decisions.jsonl 里已存在的 rename 行读取无副作用（不抛错、文件照常复制）。"""
        with self.assertRaises(SystemExit) as cm:
            module.cmd_decide(str(self.mpath), "项目A", "rename")
        self.assertIn("action 非法", str(cm.exception))
        r = self.cli("decide", "--path", "项目A", "--action", "rename")
        self.assertNotEqual(r.returncode, 0)
        self.assertFalse((self.mpath.parent / "decisions.jsonl").exists())
        with (self.mpath.parent / "decisions.jsonl").open("a", encoding="utf-8") as fh:  # 旧版写下的 rename 行
            fh.write(json.dumps({"ts": "2026-10-09T10:00:00", "path": "项目A/需求/备份.md",
                                 "action": "rename", "final_name": "新名"}, ensure_ascii=False) + "\n")
        module.cmd_project(str(self.mpath), [self.cid], "项目A", active_prd="需求/PRD-V1.md", repo=self.repo)
        self.assertTrue((self.proj / "05-prd/需求/备份.md").is_file())
        self.assertIn("迁 3 / 不迁 1 / 未决定 4", module.cmd_finish(str(self.mpath)))


class TestSkipReason(unittest.TestCase):
    def test_never_migrate_even_if_confirmed(self):
        """dataless/hidden/unreadable/unclassified 无例外；凭证/超大只有逐文件 confirm 才纳入。"""
        conf = lambda p: {p: {"path": p, "action": "confirm"}}
        for key in ("dataless", "hidden", "unreadable"):
            f = {"path": "a.md", "klass": "md", key: True}
            self.assertEqual(module._skip_reason(f, conf("a.md")), key)
        self.assertEqual(module._skip_reason({"path": "a.png", "klass": "unclassified"}, conf("a.png")), "unclassified")
        cred = {"path": "k.md", "klass": "md", "credential_hit": True}
        self.assertEqual(module._skip_reason(cred, {}), "credential_hit")
        self.assertIsNone(module._skip_reason(cred, conf("k.md")))
        # D2 改写（§4）：_skip_reason 删掉目录前缀分支，只认文件路径精确匹配
        self.assertEqual(module._skip_reason({"path": "d/x.md", "klass": "md"},
                                             {"d/x.md": {"path": "d/x.md", "action": "exclude"}}), "exclude")
        # Ruling 27：文件级 skip 与 exclude 同为文件路径精确匹配
        self.assertEqual(module._skip_reason({"path": "d/x.md", "klass": "md"},
                                             {"d/x.md": {"path": "d/x.md", "action": "skip"}}), "skip")
        self.assertIsNone(module._skip_reason({"path": "d/x.md", "klass": "md"},
                                              {"d": {"path": "d", "action": "exclude"}}), "目录前缀不再整棵跳过")
        self.assertIsNone(module._skip_reason({"path": "dd/x.md", "klass": "md"},
                                              {"d": {"path": "d", "action": "exclude"}}))


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


# ======================= deep-scan 设计 §3-§7 / §9.3：执行侧新语义 =======================

def _put(root: Path, rel: str, data="x") -> Path:
    f = root / rel
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(data, encoding="utf-8")
    return f


A = "Documents/工作/2025/项目A"


class IntakeTreeCase(unittest.TestCase):
    """tmp 里造工作区 → scan → 在假仓里跑 apply。默认树（setUp 先断言簇划分，防树一变测试空转）：
    Documents（散文件簇）/ 项目A（容器兼项目，含 需求/原型 + 凭证 md）/ 项目A/会议纪要 / 项目A/会议 / 项目B。"""

    TREE = {
        "Documents/散落.md": "# 散落",
        f"{A}/需求/x.md": "# 需求 x",
        f"{A}/需求/密钥.md": f"api_key = {'K' * 24}\n",
        f"{A}/原型/index.html": "<title>原型</title>",
        f"{A}/会议纪要/README.md": "# 纪要说明",
        f"{A}/会议纪要/周会.md": "# 周会",
        f"{A}/会议/a.md": "# 会议 a",
        f"{A}/会议/b.md": "# 会议 b",
        "Documents/项目B/方案.md": "# 方案",
        "Documents/项目B/README.md": "# 项目B",
    }

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.work = Path(self.tmp.name)
        self.repo = _fake_repo(self.work)
        self.src = self.work / "src"
        for rel, data in self.TREE.items():
            _put(self.src, rel, data)
        self.scan()
        self.assertEqual(sorted(c["source_dirs"][0] for c in self.m["clusters"]),
                         sorted(["Documents", "Documents/项目B", A, f"{A}/会议", f"{A}/会议纪要"]))

    def scan(self):
        self.m = scan_mod.scan(self.src, self.work / "_intake", extra_skill_dirs=(),
                               projects_dir=self.repo / "output/projects")
        self.mpath = self.work / "_intake" / self.m["intake_id"] / "manifest.json"
        return self.m

    def cid(self, d):
        return next(c["cluster_id"] for c in self.m["clusters"] if c["source_dirs"][0] == d)

    def project(self, cids, name, **kw):
        return module.cmd_project(str(self.mpath), cids, name, repo=self.repo, **kw)

    def proj(self, name):
        return self.repo / "output/projects" / name

    def landed(self, name):
        root = self.proj(name)
        return sorted(p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()
                      and p.relative_to(root).parts[0] in ("05-prd", "06-prototype", "07-references",
                                                           "08-reviews", "09-analytics"))

    def migrated(self):
        jl = self.mpath.parent / "migrated.jsonl"
        if not jl.exists():
            return []
        return [json.loads(l) for l in jl.read_text(encoding="utf-8").splitlines() if l.strip()]

    def manifest(self):
        return json.loads(self.mpath.read_text(encoding="utf-8"))

    def assert_no_side_effects(self, name):
        self.assertFalse(self.proj(name).exists(), "报错后不得留项目目录")
        self.assertEqual(self.manifest()["executed_projects"], [], "报错后不得登记 executed_projects")
        self.assertFalse((self.mpath.parent / "migrated.jsonl").exists(), "报错后不得写 migrated.jsonl")


class TestInclude(IntakeTreeCase):
    """§3.1 / §3.2：--include 路径分量边界、拒绝 .. 与绝对路径、去重、零命中、被拦照旧拦、跨簇落位。"""

    def test_cross_cluster_landing_keeps_subpaths(self):
        out = self.project([self.cid(A)], "项目A", includes=[f"{A}/会议纪要"], reason="纪要属于项目A")
        self.assertIn("项目落盘完成", out)
        # 公共前缀 = Documents/工作/2025/项目A → 会议纪要整目录落 05-prd/会议纪要/
        self.assertEqual(self.landed("项目A"), ["05-prd/会议纪要/README.md", "05-prd/会议纪要/周会.md",
                                                "05-prd/需求/x.md", "06-prototype/_imported/原型/index.html"])

    def test_cli_include_reason_allow_dup(self):
        """CLI 接线：--cluster-id 可缺省、--include 可重复、--reason、--allow-dup 都走得通。"""
        def run(*extra):
            return subprocess.run([sys.executable, str(ROOT / "scripts/aipm_intake_apply.py"), "project",
                                   "--manifest", str(self.mpath), "--repo", str(self.repo), *extra],
                                  capture_output=True, text=True)
        r = run("--name", "会议", "--include", f"{A}/会议/a.md", "--include", f"{A}/会议/b.md")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("--reason", r.stderr)
        r = run("--name", "会议", "--include", f"{A}/会议/a.md", "--include", f"{A}/会议/b.md", "--reason", "会议两份")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self.landed("会议"), ["05-prd/a.md", "05-prd/b.md"])
        r = run("--name", "项目A", "--cluster-id", self.cid(A), "--include", f"{A}/会议/a.md", "--reason", "r")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("--allow-dup", r.stderr)
        r = run("--name", "项目A", "--cluster-id", self.cid(A), "--include", f"{A}/会议/a.md", "--reason", "r",
                "--allow-dup")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(_entry(self.mpath, "项目A")["allow_dup"], [f"{A}/会议/a.md"])

    def test_component_boundary_and_zero_hit(self):
        self.project([], "会议", includes=[f"{A}/会议"], reason="只要会议")
        self.assertEqual(self.landed("会议"), ["05-prd/a.md", "05-prd/b.md"], "「会议」不得命中「会议纪要」")
        with self.assertRaises(SystemExit) as cm:
            self.project([], "会", includes=[f"{A}/会"], reason="前缀不是路径分量")
        self.assertIn("一个都没命中", str(cm.exception))
        self.assertIn(f"{A}/会", str(cm.exception))
        self.assertFalse(self.proj("会").exists())

    def test_rejects_absolute_and_dotdot(self):
        for bad, needle in (("/etc/passwd", "不接受绝对路径"), (f"{A}/../项目A", "不接受含 .. 的路径"),
                            ("../src/Documents", "不接受含 .. 的路径"), ("~/Documents", "不接受绝对路径")):
            with self.assertRaises(SystemExit) as cm:
                self.project([], "坏", includes=[bad], reason="r")
            self.assertIn(needle, str(cm.exception), bad)
        self.assert_no_side_effects("坏")

    def test_duplicate_includes_dedup_and_normalized(self):
        self.project([self.cid(f"{A}/会议")], "会议", includes=[f"{A}/会议/", f"{A}/会议/a.md", f"{A}/会议"],
                     reason="重复给")
        e = _entry(self.mpath, "会议")
        self.assertEqual(e["includes"], [f"{A}/会议", f"{A}/会议/a.md"])
        self.assertEqual(e["files"], [f"{A}/会议/a.md", f"{A}/会议/b.md"])
        self.assertEqual(len([r for r in self.migrated() if r["action"] == "copy"]), 2, "同一文件只复制一次")

    def test_include_hits_blocked_credential_file(self):
        self.project([], "需求", includes=[f"{A}/需求"], reason="只要需求")
        self.assertEqual(self.landed("需求"), ["05-prd/x.md"])
        skips = [(r["source_abs"].rsplit("/", 1)[-1], r["decision"]) for r in self.migrated() if r["action"] == "skip"]
        self.assertEqual(skips, [("密钥.md", "credential_hit")])

    def test_same_name_different_content_renamed_not_stopped(self):
        """§3.2：目标同名但内容不同 → 文件名前加来源末段目录名，不停项，migrated 记 renamed_from。"""
        self.project([self.cid(A)], "项目A")
        m = self.manifest(); m["executed_projects"] = []  # 模拟中断（半成品目录还在）
        self.mpath.write_text(json.dumps(m, ensure_ascii=False), encoding="utf-8")
        (self.src / f"{A}/需求/x.md").write_text("# 需求 x 改过了", encoding="utf-8")
        out = self.project([self.cid(A)], "项目A")
        self.assertIn("续传完成", out)
        self.assertEqual(self.landed("项目A"), ["05-prd/需求/x.md", "05-prd/需求/需求__x.md",
                                                "06-prototype/_imported/原型/index.html"])
        self.assertEqual((self.proj("项目A") / "05-prd/需求/需求__x.md").read_text(encoding="utf-8"), "# 需求 x 改过了")
        ren = [r for r in self.migrated() if r.get("renamed_from")]
        self.assertEqual([(r["target_rel"], r["renamed_from"]) for r in ren],
                         [("05-prd/需求/需求__x.md", "05-prd/需求/x.md")])

    def test_reason_required_for_multi_cluster_or_include(self):
        for cids, inc in (([self.cid(A), self.cid(f"{A}/会议")], None), ([self.cid(A)], [f"{A}/会议"])):
            with self.assertRaises(SystemExit) as cm:
                self.project(cids, "项目A", includes=inc)
            self.assertIn("--reason", str(cm.exception))
            self.assert_no_side_effects("项目A")
        with self.assertRaises(SystemExit) as cm:
            self.project([], "项目A")
        self.assertIn("至少给一个", str(cm.exception))
        self.project([self.cid(A), self.cid(f"{A}/会议")], "项目A", reason="会议是项目A的")
        e = _entry(self.mpath, "项目A")
        self.assertEqual((e["reason"], e["cluster_ids"], e["includes"]),
                         ("会议是项目A的", sorted([self.cid(A), self.cid(f"{A}/会议")]), []))
        self.assertEqual(sorted(e["files"]), sorted([f"{A}/需求/x.md", f"{A}/原型/index.html",
                                                     f"{A}/会议/a.md", f"{A}/会议/b.md"]))


class TestOwnershipAndRerun(IntakeTreeCase):
    """§3.3 一个文件只归一个项目；§3.4 (cluster_ids, includes) 规范化比对。"""

    def test_file_already_copied_by_other_project_rejected(self):
        self.project([self.cid(f"{A}/会议")], "会议")
        with self.assertRaises(SystemExit) as cm:
            self.project([self.cid(A)], "项目A", includes=[f"{A}/会议/a.md"], reason="想把 a 也带上")
        msg = str(cm.exception)
        self.assertIn(f"{A}/会议/a.md", msg)
        self.assertIn("会议", msg)
        self.assertIn("--allow-dup", msg)
        self.assertFalse(self.proj("项目A").exists())
        out = self.project([self.cid(A)], "项目A", includes=[f"{A}/会议/a.md"], reason="想把 a 也带上",
                           allow_dup=True)
        self.assertIn("项目落盘完成", out)
        dup = [r for r in self.migrated() if r.get("allow_dup")]
        self.assertEqual([(r["project"], r["source_abs"].endswith("会议/a.md"), r["dup_of"]) for r in dup],
                         [("项目A", True, ["会议"])])
        self.assertEqual(_entry(self.mpath, "项目A")["allow_dup"], [f"{A}/会议/a.md"])

    def test_rerun_same_combo_idempotent_different_combo_rejected(self):
        c = self.cid(A)
        self.project([c], "项目A", includes=[f"{A}/会议", f"{A}/会议纪要"], reason="r")
        # 顺序不同、带尾斜杠、重复 → 规范化后同一组合
        out = self.project([c, c], "项目A", includes=[f"{A}/会议纪要/", f"{A}/会议"], reason="r")
        self.assertIn("已复制，待补 claims 后跑 verify", out)
        with self.assertRaises(SystemExit) as cm:
            self.project([c], "项目A", includes=[f"{A}/会议"], reason="r")
        self.assertIn("已登记", str(cm.exception))
        self.assertIn(f"{A}/会议纪要", str(cm.exception))
        self.assertEqual(len(self.manifest()["executed_projects"]), 1)


class TestZeroFiles(IntakeTreeCase):
    """§6：有效文件数为 0 → 任何副作用之前报错；续传时全部已存在照常通过。"""

    def test_all_blocked(self):
        with self.assertRaises(SystemExit) as cm:
            self.project([], "空", includes=[f"{A}/需求/密钥.md"], reason="只有凭证")
        self.assertIn("有效文件数为 0", str(cm.exception))
        self.assert_no_side_effects("空")

    def test_all_excluded(self):
        for rel in ("会议/a.md", "会议/b.md"):
            module.cmd_decide(str(self.mpath), f"{A}/{rel}", "exclude")
        with self.assertRaises(SystemExit) as cm:
            self.project([self.cid(f"{A}/会议")], "会议")
        self.assertIn("有效文件数为 0", str(cm.exception))
        self.assert_no_side_effects("会议")

    def test_resume_all_existing_passes(self):
        self.project([self.cid("Documents/项目B")], "项目B")
        m = self.manifest(); m["executed_projects"] = []
        self.mpath.write_text(json.dumps(m, ensure_ascii=False), encoding="utf-8")
        copies_before = len([r for r in self.migrated() if r["action"] == "copy"])
        out = self.project([self.cid("Documents/项目B")], "项目B")
        self.assertIn("续传完成", out)
        self.assertEqual(len([r for r in self.migrated() if r["action"] == "copy"]), copies_before)
        self.assertEqual(_entry(self.mpath, "项目B")["files"], ["Documents/项目B/README.md", "Documents/项目B/方案.md"])


class TestCopySafety(IntakeTreeCase):
    """§7：扫描后被换成 symlink（或路径中间目录被换成指向扫描根外的 symlink）→ 拒绝复制。"""

    def test_symlink_swapped_after_scan_rejected(self):
        secret = self.work / "外部机密.md"; secret.write_text("# 外部机密内容", encoding="utf-8")
        f = self.src / f"{A}/会议/a.md"; f.unlink(); f.symlink_to(secret)
        outside = self.work / "外部目录"; (outside).mkdir()
        (outside / "index.html").write_text("<title>外部</title>", encoding="utf-8")
        shutil.rmtree(self.src / f"{A}/原型"); (self.src / f"{A}/原型").symlink_to(outside, target_is_directory=True)
        self.project([self.cid(A)], "项目A", includes=[f"{A}/会议"], reason="r")
        self.assertEqual(self.landed("项目A"), ["05-prd/会议/b.md", "05-prd/需求/x.md"])
        reasons = {r["source_abs"].rsplit("/", 2)[-2] + "/" + r["source_abs"].rsplit("/", 1)[-1]: r["decision"]
                   for r in self.migrated() if r["action"] == "skip"}
        self.assertEqual(reasons, {"会议/a.md": "symlink", "原型/index.html": "outside-root",
                                   "需求/密钥.md": "credential_hit"})
        dumped = "".join(p.read_text(encoding="utf-8", errors="ignore") for p in self.proj("项目A").rglob("*")
                         if p.is_file())
        self.assertNotIn("外部机密内容", dumped)
        self.assertNotIn("<title>外部</title>", dumped)
        # §5：复制时被拒的文件（symlink / 越出扫描根）在对账里算「不迁」，不算「未决定」
        self.assertIn("迁 2 / 不迁 3 / 未决定 5", module.cmd_finish(str(self.mpath)))

    def test_intermediate_dir_symlink_inside_root_rejected(self):
        """中间目录被换成 symlink，哪怕仍指向扫描根内，也不跟随（resolve 后与 root/相对路径 不一致）。"""
        b = self.src / "Documents/项目B"
        shutil.move(str(b), str(self.src / "别处B")); b.symlink_to(self.src / "别处B", target_is_directory=True)
        with self.assertRaises(SystemExit) as cm:
            self.project([self.cid("Documents/项目B")], "项目B")
        self.assertIn("有效文件数为 0", str(cm.exception))
        self.assertIn("symlink", str(cm.exception))
        self.assert_no_side_effects("项目B")


class TestExcludeSemantics(IntakeTreeCase):
    """§4：exclude 只收候选文件路径；skip-cluster 整簇不迁；confirm/install-skill 不受影响；旧目录前缀记录忽略+告警。"""

    def decisions(self):
        jl = self.mpath.parent / "decisions.jsonl"
        return [json.loads(l) for l in jl.read_text(encoding="utf-8").splitlines()] if jl.exists() else []

    def test_exclude_rejects_dir_prefix_and_missing(self):
        for bad in ("Documents", f"{A}/需求", f"{A}/需求/不存在.md", "Documents/杂物/x.png"):
            with self.assertRaises(SystemExit) as cm:
                module.cmd_decide(str(self.mpath), bad, "exclude")
            self.assertIn("只接受候选清单里的文件路径", str(cm.exception), bad)
            self.assertIn("skip-cluster", str(cm.exception))
        self.assertEqual(self.decisions(), [])
        r = subprocess.run([sys.executable, str(ROOT / "scripts/aipm_intake_apply.py"), "decide", "--manifest",
                            str(self.mpath), "--path", "Documents", "--action", "exclude"], capture_output=True, text=True)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("skip-cluster", r.stderr)

    def test_confirm_and_install_skill_paths_not_validated(self):
        for path, action in (("随便/不在清单.md", "confirm"), (f"{A}/需求/密钥.md", "confirm"),
                             ("某处/helper/SKILL.md", "install-skill"), ("Documents", "skip")):
            module.cmd_decide(str(self.mpath), path, action)
        self.assertEqual([d["action"] for d in self.decisions()],
                         ["confirm", "confirm", "install-skill", "skip"])

    def test_skip_cluster(self):
        c = self.cid(f"{A}/会议")
        r = subprocess.run([sys.executable, str(ROOT / "scripts/aipm_intake_apply.py"), "decide", "--manifest",
                            str(self.mpath), "--cluster-id", c, "--action", "skip-cluster"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual([(d["cluster_id"], d["action"]) for d in self.decisions()], [(c, "skip-cluster")])
        with self.assertRaises(SystemExit) as cm:
            module.cmd_decide(str(self.mpath), None, "skip-cluster", cluster_id="c999")
        self.assertIn("c999", str(cm.exception))
        with self.assertRaises(SystemExit):
            module.cmd_decide(str(self.mpath), f"{A}/会议/a.md", "skip-cluster")  # skip-cluster 只认 --cluster-id
        with self.assertRaises(SystemExit) as cm:
            self.project([c], "会议")
        self.assertIn("skip-cluster", str(cm.exception))
        self.assert_no_side_effects("会议")
        # include 进来的文件若属于已 skip-cluster 的簇 → 跳过（决定生效），其余照常
        self.project([self.cid(A)], "项目A", includes=[f"{A}/会议/a.md"], reason="r")
        self.assertEqual(self.landed("项目A"), ["05-prd/需求/x.md", "06-prototype/_imported/原型/index.html"])
        self.assertIn(("a.md", "skip-cluster"), [(r["source_abs"].rsplit("/", 1)[-1], r["decision"])
                                                for r in self.migrated() if r["action"] == "skip"])
        # confirm 同一簇 = 撤销 skip-cluster
        module.cmd_decide(str(self.mpath), None, "confirm", cluster_id=c)
        self.project([c], "会议")
        self.assertEqual(self.landed("会议"), ["05-prd/a.md", "05-prd/b.md"])

    def test_legacy_dir_prefix_exclude_ignored_with_warning(self):
        """遗留问题回归：旧版 exclude「Documents」散文件簇前缀会整棵吞掉其下子项目。
        新语义：只 exclude 散文件簇里的那个文件，旧前缀记录读取时忽略并告警；项目B 文件数等于预期。"""
        module.cmd_decide(str(self.mpath), "Documents/散落.md", "exclude")
        with (self.mpath.parent / "decisions.jsonl").open("a", encoding="utf-8") as fh:  # 旧版写下的目录前缀记录
            fh.write(json.dumps({"ts": "2026-10-09T10:00:00", "path": "Documents", "action": "exclude",
                                 "final_name": None}, ensure_ascii=False) + "\n")
        out = self.project([self.cid("Documents/项目B")], "项目B")
        self.assertIn("已忽略", out)
        self.assertIn("Documents", out.split("已忽略", 1)[1])
        self.assertEqual(self.landed("项目B"), ["05-prd/README.md", "05-prd/方案.md"])
        self.assertEqual(len([r for r in self.migrated() if r["action"] == "copy" and r["project"] == "项目B"]), 2)
        with self.assertRaises(SystemExit) as cm:  # 散文件簇只剩被 exclude 的那个文件 → 零文件
            self.project([self.cid("Documents")], "Documents")
        self.assertIn("有效文件数为 0", str(cm.exception))
        self.assertIn("已忽略", module.cmd_finish(str(self.mpath)))


class TestFinishByFile(IntakeTreeCase):
    """§5：finish 按文件对账——迁 / 不迁 / 未决定，另列已 copy 未 verify 的项目数。"""

    def test_counts(self):
        # 候选 10 个：散落 / x / 密钥 / index / README(纪要) / 周会 / a / b / 方案 / README(B)
        cand = sum(len(c["files"]) for c in self.m["clusters"])
        self.assertEqual(cand, 10)
        self.project([self.cid(A)], "项目A", includes=[f"{A}/会议纪要/周会.md"], reason="周会归项目A")  # 迁 3，密钥被拦
        module.cmd_decide(str(self.mpath), None, "skip-cluster", cluster_id=self.cid(f"{A}/会议"))      # 不迁 a b
        module.cmd_decide(str(self.mpath), "Documents/散落.md", "exclude")                              # 不迁 散落
        out = module.cmd_finish(str(self.mpath))
        # 迁 x/index/周会 = 3；不迁 密钥/a/b/散落 = 4；未决定 纪要README/方案/项目B README = 3
        self.assertIn("迁 3 / 不迁 4 / 未决定 3", out)
        self.assertIn("已 copy 未 verify 的项目 1 个", out)
        self.assertIn("未处理簇 2", out, "簇级展示：项目A、会议、Documents 已全处理；会议纪要、项目B 未全处理")
        self.assertEqual(self.manifest()["stage"], "done")
        _inject_claims(self.proj("项目A"), "05-prd/需求/x.md")
        module.cmd_verify(str(self.mpath), "项目A", repo=self.repo)
        self.assertIn("已 copy 未 verify 的项目 0 个", module.cmd_finish(str(self.mpath)))


if __name__ == "__main__":
    unittest.main()
