"""本机注册表 overlay（Ruling 13）：合并读取 / 重名降级 / 防回退 / contracts 子命令 / scan 撞名。

全部在临时假仓里跑，不读写真实仓库的 overlay（开发者本机有没有 overlay 都不影响结果）。
"""
from __future__ import annotations
import importlib.util, json, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import aipm_core  # noqa: E402
_sc = importlib.util.spec_from_file_location("aipm_intake_scan", ROOT / "scripts/aipm_intake_scan.py")
scan_mod = importlib.util.module_from_spec(_sc); assert _sc.loader; _sc.loader.exec_module(scan_mod)

PUBLIC = {
    "schema_version": 1,
    "modes": [{"id": m, "capabilities": ["core"] if m == "prd" else []}
              for m in ("explore", "decide", "prd", "prototype", "review", "operate")],
    "capabilities": [{"id": "core", "skill": "core", "modes": ["prd"], "phase_effect": {"kind": "none"},
                      "artifacts": [], "side_effects": [], "legacy_commands": ["/core"]}],
}


def ext(name: str, **over) -> dict:
    entry = {"id": name, "skill": name, "availability": "optional-private", "modes": [],
             "phase_effect": {"kind": "none"}, "artifacts": ["external-skill"],
             "side_effects": ["read-project", "write-local"], "legacy_commands": [f"/{name}"]}
    entry.update(over)
    return entry


class OverlayCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.repo = Path(self.tmp.name)
        (self.repo / "templates/configs").mkdir(parents=True)
        self.write_public(PUBLIC)
        for name in ("core",):
            (self.repo / ".claude/skills" / name).mkdir(parents=True)
            (self.repo / ".claude/skills" / name / "SKILL.md").write_text("---\ndescription: x\n---\n")

    def write_public(self, data):
        (self.repo / "templates/configs/capability-registry.json").write_text(json.dumps(data), encoding="utf-8")

    def write_local(self, data):
        p = aipm_core.local_registry_path(self.repo)
        p.write_text(data if isinstance(data, str) else json.dumps(data), encoding="utf-8")

    def add_disk_skill(self, name):
        (self.repo / ".claude/skills" / name).mkdir(parents=True)
        (self.repo / ".claude/skills" / name / "SKILL.md").write_text("---\ndescription: x\n---\n")


class LoadRegistryTests(OverlayCase):
    def test_no_overlay_equals_public(self):
        merged, errors, warnings = aipm_core.load_capability_registry(self.repo)
        self.assertEqual(merged["capabilities"], PUBLIC["capabilities"])
        self.assertEqual((errors, warnings), ([], []))

    def test_overlay_merged(self):
        self.write_local({"schema_version": 1, "capabilities": [ext("helper")]})
        merged, errors, _ = aipm_core.load_capability_registry(self.repo)
        self.assertEqual(errors, [])
        self.assertEqual([c["id"] for c in merged["capabilities"]], ["core", "helper"])

    def test_include_local_false_skips_overlay(self):
        self.write_local({"schema_version": 1, "capabilities": [ext("helper")]})
        merged, errors, _ = aipm_core.load_capability_registry(self.repo, include_local=False)
        self.assertEqual([c["id"] for c in merged["capabilities"]], ["core"])

    def test_broken_overlay_is_error_and_not_merged(self):
        self.write_local("{not json")
        merged, errors, _ = aipm_core.load_capability_registry(self.repo)
        self.assertTrue(errors and "capability-registry.local.json" in errors[0], errors)
        self.assertEqual([c["id"] for c in merged["capabilities"]], ["core"])

    def test_overlay_top_level_modes_rejected(self):
        self.write_local({"schema_version": 1, "modes": [], "capabilities": [ext("helper")]})
        merged, errors, _ = aipm_core.load_capability_registry(self.repo)
        self.assertTrue(any("modes" in e for e in errors), errors)
        self.assertEqual([c["id"] for c in merged["capabilities"]], ["core"])

    def test_overlay_bad_schema_version(self):
        self.write_local({"schema_version": 2, "capabilities": []})
        _, errors, _ = aipm_core.load_capability_registry(self.repo)
        self.assertTrue(any("schema_version" in e for e in errors), errors)

    def test_overlay_entry_violations_dropped(self):
        self.write_local({"schema_version": 1, "capabilities": [
            ext("routed", modes=["prd"]), ext("req", availability="required"),
            ext("bad name!"), ext("ok")]})
        merged, errors, _ = aipm_core.load_capability_registry(self.repo)
        self.assertEqual(len(errors), 3, errors)
        self.assertEqual([c["id"] for c in merged["capabilities"]], ["core", "ok"])

    def test_overlay_internal_duplicate_casefold(self):
        self.write_local({"schema_version": 1, "capabilities": [ext("helper"), ext("Helper")]})
        merged, errors, _ = aipm_core.load_capability_registry(self.repo)
        self.assertTrue(any("重复" in e for e in errors), errors)
        self.assertEqual([c["id"] for c in merged["capabilities"]], ["core", "helper"])

    def test_public_collision_is_warning_public_wins(self):
        self.write_local({"schema_version": 1, "capabilities": [ext("CORE")]})
        merged, errors, warnings = aipm_core.load_capability_registry(self.repo)
        self.assertEqual(errors, [])
        self.assertTrue(any("官方已收编" in w for w in warnings), warnings)
        self.assertEqual([c["id"] for c in merged["capabilities"]], ["core"])

    def test_public_with_external_skill_is_error(self):
        """防回退：有人把装载改回写公共表，回归必须红。"""
        bad = json.loads(json.dumps(PUBLIC))
        bad["capabilities"].append(ext("leaked"))
        self.write_public(bad)
        _, errors, _ = aipm_core.load_capability_registry(self.repo, include_local=False)
        self.assertTrue(any("external-skill" in e for e in errors), errors)

    def test_public_missing_raises(self):
        (self.repo / "templates/configs/capability-registry.json").unlink()
        with self.assertRaises(ValueError):
            aipm_core.load_capability_registry(self.repo)

    def test_external_skill_registered_only_in_overlay_validates_clean(self):
        """架构师#1：外部 skill 目录在磁盘、只登记在 overlay → 合并后 validate 不报「尚未登记」。"""
        self.add_disk_skill("helper")
        self.write_local({"schema_version": 1, "capabilities": [ext("helper")]})
        merged, errors, _ = aipm_core.load_capability_registry(self.repo)
        verrors, vwarnings = aipm_core.validate_capability_registry(merged, self.repo / ".claude/skills")
        self.assertEqual(errors + verrors, [])
        self.assertFalse(any("尚未登记" in w for w in vwarnings), vwarnings)


class HelperTests(OverlayCase):
    def test_name_hits_casefold_and_commands(self):
        data = {"capabilities": [ext("helper", legacy_commands=["/hlp"])]}
        self.assertTrue(aipm_core.registry_name_hits(data, "HELPER"))
        self.assertTrue(aipm_core.registry_name_hits(data, "hlp"))
        self.assertFalse(aipm_core.registry_name_hits(data, "other"))

    def test_skill_name_re(self):
        for ok in ("helper", "my-helper", "d2c.v2", "A_b9"):
            self.assertTrue(aipm_core.SKILL_NAME_RE.match(ok), ok)
        for bad in ("x\n!output", "My Skill[1]", ".hidden", "-x", "a/b", "", "a" * 65, "中文"):
            self.assertFalse(aipm_core.SKILL_NAME_RE.match(bad), bad)

    def test_disk_skills_param_overrides_scan(self):
        self.add_disk_skill("helper")
        errors, warnings = aipm_core.validate_capability_registry(
            PUBLIC, self.repo / ".claude/skills", disk_skills={"core"})
        self.assertFalse(any("尚未登记" in w for w in warnings), warnings)
        _, warnings = aipm_core.validate_capability_registry(PUBLIC, self.repo / ".claude/skills")
        self.assertTrue(any("尚未登记" in w for w in warnings), warnings)

    def test_tracked_skill_names(self):
        self.assertIsNone(aipm_core.tracked_skill_names(self.repo))
        names = aipm_core.tracked_skill_names(ROOT)
        if names is not None:  # 分发安装没有 git
            self.assertIn("ai-pm-intake", names)


class ContractsCliTests(OverlayCase):
    def run_cli(self, *extra):
        return subprocess.run([sys.executable, str(ROOT / "scripts/aipm_contracts.py"), "capabilities",
                               "--root", str(self.repo), *extra], capture_output=True, text=True)

    def test_broken_overlay_nonzero(self):
        self.write_local("{not json")
        self.assertNotEqual(self.run_cli().returncode, 0)
        self.assertEqual(self.run_cli("--public-only").returncode, 0, "回归用 --public-only，不受本机 overlay 影响")

    def test_overlay_names_hidden_unless_verbose(self):
        self.write_local({"schema_version": 1, "capabilities": [ext("secretname")]})  # 目录不在 → 未安装 warning
        r = self.run_cli()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertNotIn("secretname", r.stdout)
        self.assertIn("本机注册表", r.stdout)
        self.assertIn("secretname", self.run_cli("--verbose").stdout)

    def test_public_only_ignores_untracked_disk_skill(self):
        """回归口径：「尚未登记」只看入库的 skill；假仓没有 git 时回退到磁盘扫描。"""
        subprocess.run(["git", "init", "-q", str(self.repo)], check=True)
        subprocess.run(["git", "-C", str(self.repo), "add", ".claude/skills/core/SKILL.md"], check=True)
        self.add_disk_skill("helper")
        r = self.run_cli("--public-only")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("PASS", r.stdout)
        self.assertNotIn("尚未登记", r.stdout)
        self.assertNotIn("helper", r.stdout)


class ScanCollisionTests(OverlayCase):
    def test_overlay_name_collides_in_fake_repo(self):
        self.write_local({"schema_version": 1, "capabilities": [ext("helper")]})
        hits = scan_mod._skill_collisions("Helper", extra_skill_dirs=(), repo=self.repo)
        self.assertTrue(any(h.startswith("registry:") for h in hits), hits)
        self.assertEqual(scan_mod._skill_collisions("fresh", extra_skill_dirs=(), repo=self.repo), [])


if __name__ == "__main__":
    unittest.main()
