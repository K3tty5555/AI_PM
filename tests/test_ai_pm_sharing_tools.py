from __future__ import annotations

import importlib.util
import json
import subprocess
import tempfile
import unittest
from unittest import mock
from datetime import date
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
CREATE_SCRIPT = (
    REPO
    / ".claude"
    / "skills"
    / "ai-pm-sharing"
    / "scripts"
    / "create_article_workspace.py"
)
CHECK_SCRIPT = (
    REPO
    / ".claude"
    / "skills"
    / "ai-pm-sharing"
    / "scripts"
    / "check_article_ready.py"
)


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载模块：{path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class CreateWorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.module = load_module(CREATE_SCRIPT, "create_article_workspace")
        self.tempdir = tempfile.TemporaryDirectory()
        self.repo = Path(self.tempdir.name)

    def tearDown(self):
        self.tempdir.cleanup()

    def test_sanitize_topic_keeps_readable_chinese_and_removes_path_tokens(self):
        self.assertEqual(
            self.module.sanitize_topic("../../经验/分享：方法？"),
            "经验-分享-方法",
        )

    def test_empty_topic_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "主题不能为空"):
            self.module.sanitize_topic(" ../ ")

    def test_control_characters_are_removed_and_length_is_capped(self):
        slug = self.module.sanitize_topic("经验\x00分享" + "长" * 100)
        self.assertNotIn("\x00", slug)
        self.assertLessEqual(len(slug), 60)

    def test_create_workspace_builds_private_boundary_and_draft_metadata(self):
        workspace = self.module.create_workspace(
            self.repo, "需求评审经验", date(2026, 7, 30)
        )
        expected = (
            self.repo.resolve()
            / "output/sharing/articles/2026-07-30-需求评审经验"
        )
        self.assertEqual(workspace, expected)
        self.assertTrue((workspace / "_private").is_dir())
        self.assertTrue((workspace / "_private/assets").is_dir())
        self.assertFalse((workspace / "publish").exists())
        meta = json.loads((workspace / "_meta.json").read_text(encoding="utf-8"))
        self.assertEqual(meta["content_type"], "article")
        self.assertEqual(meta["status"], "draft")
        self.assertEqual(meta["title"], "需求评审经验")
        self.assertEqual(meta["created_at"], "2026-07-30")
        self.assertEqual(meta["updated_at"], "2026-07-30")
        self.assertFalse(meta["assets_visual_reviewed"])
        self.assertFalse(meta["assets_metadata_reviewed"])
        self.assertIsNone(meta["assets_metadata_tool"])

    def test_same_day_same_topic_never_overwrites(self):
        first = self.module.create_workspace(
            self.repo, "需求评审经验", date(2026, 7, 30)
        )
        second = self.module.create_workspace(
            self.repo, "需求评审经验", date(2026, 7, 30)
        )
        self.assertEqual(first.name, "2026-07-30-需求评审经验")
        self.assertEqual(second.name, "2026-07-30-需求评审经验-02")

    def test_symlinked_repo_root_is_rejected(self):
        real_repo = self.repo / "real"
        real_repo.mkdir()
        linked_repo = self.repo / "linked"
        linked_repo.symlink_to(real_repo, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "仓库根目录不能是符号链接"):
            self.module.create_workspace(
                linked_repo, "需求评审经验", date(2026, 7, 30)
            )

    def test_symlinked_articles_root_is_rejected(self):
        outside = self.repo / "outside"
        outside.mkdir()
        sharing = self.repo / "output/sharing"
        sharing.mkdir(parents=True)
        (sharing / "articles").symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "符号链接"):
            self.module.create_workspace(
                self.repo, "需求评审经验", date(2026, 7, 30)
            )


class CandidatePublishTests(unittest.TestCase):
    def setUp(self):
        self.module = load_module(CHECK_SCRIPT, "check_article_ready")
        self.tempdir = tempfile.TemporaryDirectory()
        self.repo = Path(self.tempdir.name)
        self.root = self.repo / "output" / "sharing" / "articles"
        self.workspace = self.root / "2026-07-30-经验文章"
        (self.workspace / "_private" / "assets").mkdir(parents=True)
        self.write_meta()
        self.denylist = self.repo / "denylist"
        self.denylist.write_text(
            r"内部(客户|代号)" + "\n",
            encoding="utf-8",
        )

    def tearDown(self):
        self.tempdir.cleanup()

    def write_meta(self, **overrides):
        metadata = {
            "content_type": "article",
            "status": "draft",
            "title": "经验文章",
            "created_at": "2026-07-30",
            "updated_at": "2026-07-30",
            "assets_visual_reviewed": False,
            "assets_metadata_reviewed": False,
            "assets_metadata_tool": None,
        }
        metadata.update(overrides)
        (self.workspace / "_meta.json").write_text(
            json.dumps(metadata, ensure_ascii=False),
            encoding="utf-8",
        )

    def write_candidate(self, text):
        (self.workspace / "_private" / "candidate.md").write_text(
            text,
            encoding="utf-8",
        )

    def valid_article(self):
        return (
            "# 一次需求评审实践\n\n先说结论。\n\n"
            "## 我做了什么\n\n具体过程。\n\n"
            "## 可以直接拿走的做法\n\n- 做法一\n\n"
            "## 适用边界\n\n只适合已有评审素材的场景。\n"
        )

    def test_valid_candidate_is_promoted_then_marked_ready(self):
        self.write_candidate(self.valid_article())
        publish = self.module.promote_candidate(
            self.workspace,
            self.root,
            self.denylist,
        )
        self.assertEqual(publish, self.workspace / "publish" / "article.md")
        self.assertTrue(publish.is_file())
        meta = json.loads((self.workspace / "_meta.json").read_text("utf-8"))
        self.assertEqual(meta["status"], "ready")

    def test_failed_candidate_never_creates_publish_or_ready(self):
        self.write_candidate("# 标题\n\n[待核实]\n")
        with self.assertRaisesRegex(ValueError, "待核实"):
            self.module.promote_candidate(
                self.workspace,
                self.root,
                self.denylist,
            )
        self.assertFalse((self.workspace / "publish").exists())
        meta = json.loads((self.workspace / "_meta.json").read_text("utf-8"))
        self.assertEqual(meta["status"], "draft")

    def test_template_residue_prd_heading_and_secret_are_blocked(self):
        self.write_candidate(
            "# 用具体问题、关键判断或实践结果命名\n"
            "<!-- 删除本注释 -->\n"
            "## 三、功能清单\n"
            "secret sk-" + "a" * 24
        )
        problems = "\n".join(
            self.module.validate_candidate(
                self.workspace,
                self.root,
                self.denylist,
            )
        )
        self.assertIn("模板残留", problems)
        self.assertIn("PRD 骨架", problems)
        self.assertIn("疑似密钥", problems)

    def test_denylist_uses_regex_and_invalid_regex_blocks(self):
        self.write_candidate("# 内部客户实践\n")
        problems = "\n".join(
            self.module.validate_candidate(
                self.workspace,
                self.root,
                self.denylist,
            )
        )
        self.assertIn("命中 denylist", problems)

        self.denylist.write_text("未闭合(\n", encoding="utf-8")
        problems = "\n".join(
            self.module.validate_candidate(
                self.workspace,
                self.root,
                self.denylist,
            )
        )
        self.assertIn("denylist 正则无效", problems)

    def test_strict_mode_requires_denylist_or_explicit_confirmation(self):
        self.write_candidate("# 标题\n")
        self.denylist.unlink()
        problems = "\n".join(
            self.module.validate_candidate(
                self.workspace,
                self.root,
                None,
                strict=True,
            )
        )
        self.assertIn("缺少 denylist", problems)

        problems = self.module.validate_candidate(
            self.workspace,
            self.root,
            None,
            strict=True,
            confirm_missing_denylist=True,
        )
        self.assertEqual(problems, [])

    def test_symlinked_publish_or_asset_is_blocked(self):
        self.write_candidate("# 标题\n\n![图](assets/screenshot.png)\n")
        outside = self.repo / "outside.png"
        outside.write_bytes(b"png")
        (self.workspace / "_private" / "assets" / "screenshot.png").symlink_to(
            outside
        )
        problems = "\n".join(
            self.module.validate_candidate(
                self.workspace,
                self.root,
                self.denylist,
                confirm_visual_review=True,
                confirm_metadata_review=True,
            )
        )
        self.assertIn("符号链接", problems)

        (self.workspace / "_private" / "assets" / "screenshot.png").unlink()
        outside_dir = self.repo / "outside-publish"
        outside_dir.mkdir()
        (self.workspace / "publish").symlink_to(
            outside_dir,
            target_is_directory=True,
        )
        problems = "\n".join(
            self.module.validate_candidate(
                self.workspace,
                self.root,
                self.denylist,
            )
        )
        self.assertIn("符号链接", problems)

    def test_only_supported_local_asset_links_are_allowed(self):
        self.write_candidate(
            "# 标题\n\n"
            "![图](../source.png)\n"
            '<img src="assets/a.png">\n'
            "[附件][local]\n"
            "[local]: assets/a.png\n"
        )
        problems = "\n".join(
            self.module.validate_candidate(
                self.workspace,
                self.root,
                self.denylist,
            )
        )
        self.assertIn("附件路径逃逸", problems)
        self.assertIn("不支持的本地附件语法", problems)

    def test_assets_need_separate_visual_and_metadata_confirmation(self):
        self.write_candidate("# 标题\n\n![图](assets/a.png)\n")
        (self.workspace / "_private" / "assets" / "a.png").write_bytes(b"png")
        with mock.patch.object(self.module.shutil, "which", return_value=None):
            problems = "\n".join(
                self.module.validate_candidate(
                    self.workspace,
                    self.root,
                    self.denylist,
                )
            )
            self.assertIn("画面尚未确认", problems)
            self.assertIn("元数据尚未确认", problems)

            confirmed = self.module.validate_candidate(
                self.workspace,
                self.root,
                self.denylist,
                confirm_visual_review=True,
                confirm_metadata_review=True,
            )
        self.assertEqual(confirmed, [])

    def test_metadata_and_candidate_shape_errors_are_blocked(self):
        self.write_candidate("")
        (self.workspace / "_meta.json").write_text("{", encoding="utf-8")
        problems = "\n".join(
            self.module.validate_candidate(
                self.workspace,
                self.root,
                self.denylist,
            )
        )
        self.assertIn("_meta.json 损坏", problems)
        self.assertIn("候选稿为空", problems)

        self.write_meta(content_type="prd")
        self.write_candidate("# 标题\n")
        problems = "\n".join(
            self.module.validate_candidate(
                self.workspace,
                self.root,
                self.denylist,
            )
        )
        self.assertIn("content_type", problems)

    def test_encoded_path_escape_and_candidate_symlink_are_blocked(self):
        self.write_candidate("# 标题\n\n![图](assets/%2E%2E/secret.png)\n")
        problems = "\n".join(
            self.module.validate_candidate(
                self.workspace,
                self.root,
                self.denylist,
            )
        )
        self.assertIn("附件路径逃逸", problems)

        (self.workspace / "_private" / "candidate.md").unlink()
        outside = self.repo / "outside.md"
        outside.write_text("# 外部文件\n", encoding="utf-8")
        (self.workspace / "_private" / "candidate.md").symlink_to(outside)
        problems = "\n".join(
            self.module.validate_candidate(
                self.workspace,
                self.root,
                self.denylist,
            )
        )
        self.assertIn("候选稿不能是符号链接", problems)

    def test_query_string_and_broken_asset_are_blocked(self):
        self.write_candidate(
            "# 标题\n\n"
            "![带查询参数的图](assets/a.png?download=1)\n"
            "[不存在的附件](assets/missing.pdf)\n"
        )
        problems = "\n".join(
            self.module.validate_candidate(
                self.workspace,
                self.root,
                self.denylist,
            )
        )
        self.assertIn("query string", problems)
        self.assertIn("附件不存在", problems)

    def test_existing_publish_requires_replace_and_keeps_backup(self):
        self.write_candidate(self.valid_article())
        self.module.promote_candidate(self.workspace, self.root, self.denylist)
        old_text = (self.workspace / "publish" / "article.md").read_text("utf-8")

        self.write_meta(status="draft")
        self.write_candidate(self.valid_article().replace("先说结论", "新的结论"))
        with self.assertRaisesRegex(ValueError, "replace"):
            self.module.promote_candidate(
                self.workspace,
                self.root,
                self.denylist,
            )
        self.assertEqual(
            (self.workspace / "publish" / "article.md").read_text("utf-8"),
            old_text,
        )

        publish = self.module.promote_candidate(
            self.workspace,
            self.root,
            self.denylist,
            replace=True,
        )
        self.assertIn("新的结论", publish.read_text("utf-8"))
        backups = list((self.workspace / "_private").glob("publish-backup-*"))
        self.assertEqual(len(backups), 1)

    def test_metadata_update_failure_rolls_back_publish_and_status(self):
        self.write_candidate(self.valid_article())
        with mock.patch.object(
            self.module,
            "_write_ready_metadata",
            side_effect=OSError("模拟元数据写入失败"),
        ):
            with self.assertRaisesRegex(OSError, "模拟元数据写入失败"):
                self.module.promote_candidate(
                    self.workspace,
                    self.root,
                    self.denylist,
                )
        self.assertFalse((self.workspace / "publish").exists())
        meta = json.loads((self.workspace / "_meta.json").read_text("utf-8"))
        self.assertEqual(meta["status"], "draft")

    def test_metadata_update_failure_restores_previous_publish(self):
        self.write_candidate(self.valid_article())
        self.module.promote_candidate(self.workspace, self.root, self.denylist)
        old_text = (self.workspace / "publish" / "article.md").read_text("utf-8")

        self.write_meta(status="draft")
        self.write_candidate(self.valid_article().replace("先说结论", "新的结论"))
        with mock.patch.object(
            self.module,
            "_write_ready_metadata",
            side_effect=OSError("模拟元数据写入失败"),
        ):
            with self.assertRaisesRegex(OSError, "模拟元数据写入失败"):
                self.module.promote_candidate(
                    self.workspace,
                    self.root,
                    self.denylist,
                    replace=True,
                )
        self.assertEqual(
            (self.workspace / "publish" / "article.md").read_text("utf-8"),
            old_text,
        )
        meta = json.loads((self.workspace / "_meta.json").read_text("utf-8"))
        self.assertEqual(meta["status"], "draft")

    def test_exiftool_scan_strip_and_tool_recording(self):
        self.write_candidate("# 标题\n\n![图](assets/a.png)\n")
        (self.workspace / "_private" / "assets" / "a.png").write_bytes(b"png")

        def fake_run(command, **kwargs):
            if "-json" in command:
                return subprocess.CompletedProcess(
                    command,
                    0,
                    stdout='[{"SourceFile":"x","FileType":"PNG"}]',
                    stderr="",
                )
            return subprocess.CompletedProcess(
                command,
                0,
                stdout="",
                stderr="",
            )

        with mock.patch.object(
            self.module.shutil,
            "which",
            return_value="/usr/local/bin/exiftool",
        ), mock.patch.object(
            self.module.subprocess,
            "run",
            side_effect=fake_run,
        ) as run:
            publish = self.module.promote_candidate(
                self.workspace,
                self.root,
                self.denylist,
                confirm_visual_review=True,
            )

        self.assertTrue(publish.is_file())
        self.assertTrue(any("-all=" in call.args[0] for call in run.call_args_list))
        meta = json.loads((self.workspace / "_meta.json").read_text("utf-8"))
        self.assertTrue(meta["assets_visual_reviewed"])
        self.assertTrue(meta["assets_metadata_reviewed"])
        self.assertEqual(meta["assets_metadata_tool"], "exiftool")


if __name__ == "__main__":
    unittest.main()
