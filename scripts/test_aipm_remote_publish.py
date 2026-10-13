#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError


ROOT = Path(__file__).resolve().parents[1]


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


publish = load("aipm_remote_publish", ROOT / "scripts" / "aipm_remote_publish.py")
feedback = load("aipm_remote_feedback", ROOT / "scripts" / "aipm_remote_feedback.py")


class RemotePublishTests(unittest.TestCase):
    def make_root(self, root: Path) -> Path:
        prototype = root / "06-prototype"
        (prototype / "lowfi").mkdir(parents=True)
        (prototype / "review").mkdir()
        (prototype / "feedback").mkdir()
        (prototype / "index.html").write_text("<html><body>prototype</body></html>", encoding="utf-8")
        (prototype / "lowfi" / "index.html").write_text("<html><body>lowfi</body></html>", encoding="utf-8")
        (prototype / "review" / "index.html").write_text("<html><body>review</body></html>", encoding="utf-8")
        (prototype / "feedback" / "old.json").write_text("private", encoding="utf-8")
        (prototype / "index.html.pre-annotation.bak").write_text("backup", encoding="utf-8")
        return prototype

    def test_manifest_is_deterministic_and_excludes_feedback(self):
        with tempfile.TemporaryDirectory() as tmp:
            prototype = self.make_root(Path(tmp))
            records = publish.content_hashes(prototype)
            spec_hash = "a" * 64
            prototype_hash = hashlib.sha256(prototype.joinpath("index.html").read_bytes()).hexdigest()
            manifest = publish.build_manifest(prototype, "项目A", spec_hash, prototype_hash, "https://review.example.com")
            self.assertEqual(publish.validate_manifest(manifest), [])
            self.assertEqual(manifest["build_id"], publish.build_id_for(records, spec_hash))
            self.assertTrue(all(not item["path"].startswith("feedback/") for item in manifest["files"]))
            self.assertTrue(manifest["urls"]["review"].endswith("/review/index.html"))

    def test_runtime_and_review_forward_share_token(self):
        with tempfile.TemporaryDirectory() as tmp:
            prototype = self.make_root(Path(tmp))
            spec = {"schema_version": 1, "project": "项目A", "title": "项目A", "pages": [{"page_id": "home", "title": "首页", "summary": "", "states": [{"state_id": "default", "title": "默认", "kind": "default", "layout": [{"kind": "content", "span": 12}]}]}], "flows": [{"flow_id": "main", "title": "主流程", "steps": [{"step_id": "s1", "page_id": "home", "state_id": "default"}]}]}
            module = load("aipm_prototype_collab_token", ROOT / "scripts" / "aipm_prototype_collab.py")
            approval = {"spec_hash": module.content_hash(spec), "decision": "approved"}
            rendered = module.render_review(spec, "../index.html", "abc123", approval)
            runtime = module.annotation_runtime()
            self.assertIn("aipm_write_token", rendered)
            self.assertIn("X-AIPM-Feedback-Token", rendered)
            self.assertIn("X-AIPM-Feedback-Token", runtime)

    def test_token_mode_bundle_and_plan_do_not_leak_a_token(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            prototype = self.make_root(root)
            output = root / "out"
            args = type("Args", (), {
                "prototype": str(prototype), "project": "项目A", "spec_hash": "b" * 64,
                "prototype_hash": "c" * 64, "base_url": "https://review.example.com",
                "access_mode": "token", "build_id": None, "out": str(output),
            })()
            self.assertEqual(publish.command_prepare(args), 0)
            manifest = json.loads((output / "remote-publish.json").read_text(encoding="utf-8"))
            policy = json.loads((output / "remote-feedback-policy.json").read_text(encoding="utf-8"))
            bundle = output / f"remote-publish-{manifest['build_id']}.tar.gz"
            self.assertTrue(bundle.is_file())
            self.assertEqual(publish.validate_manifest(manifest), [])
            self.assertNotIn("ACCESS_TOKEN", (output / "remote-publish.json").read_text(encoding="utf-8"))
            self.assertTrue(policy["builds"][f"项目A/{'b' * 64}"]["write_token_hash"])
            self.assertTrue(policy["builds"][f"项目A/{'b' * 64}"]["path_prefix"].startswith("/aipm/"))
            plan = publish.deployment_plan(manifest, bundle, "ubuntu@example.com", "/srv/aipm", output / "remote-feedback-policy.json")
            self.assertTrue(any("rsync" in line for line in plan))
            self.assertTrue(any("--policy" in line for line in plan))
            self.assertTrue(any(f"/srv/aipm/项目A" in line for line in plan))
            self.assertTrue(all("ACCESS_TOKEN" not in line for line in plan))

    def test_feedback_pull_is_plan_only_by_default(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            prototype = self.make_root(root)
            manifest = publish.build_manifest(prototype, "项目A", "f" * 64, "a" * 64, "https://review.example.com")
            out = root / "feedback"
            plan = publish.feedback_pull_plan(manifest, "ubuntu@example.com", "/srv/aipm", out)
            self.assertEqual(len(plan), 2)
            self.assertIn("--ignore-existing", plan[1])
            self.assertFalse(out.exists())

    def test_feedback_server_requires_token_and_preserves_snapshots(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            token = "review-secret"
            spec_hash = "d" * 64
            policy = {"项目A/" + spec_hash: {
                "build_id": "b-test1234", "access_mode": "token",
                "path_prefix": "/aipm/%E9%A1%B9%E7%9B%AEA/b-test1234/",
                "write_token_hash": hashlib.sha256(token.encode()).hexdigest(),
                "feedback_dir": "项目A/b-test1234/feedback",
            }}
            app = feedback.FeedbackApp(root, policy)
            data = {"schema_version": 1, "project": "项目A", "spec_hash": spec_hash,
                    "stage": "highfi-review", "exported_at": "2026-10-13T10:00:00+08:00",
                    "items": [{"feedback_id": "review-1", "feedback_type": "review-comment",
                               "page_id": "home", "state_id": "default", "status": "open",
                               "comment": "请调整", "category": "other", "severity": "major",
                               "updated_at": "2026-10-13T10:00:00+08:00"}]}
            with self.assertRaises(feedback.SpecError):
                app.save(data, "wrong")
            relative = app.save(data, token)
            self.assertTrue((root / relative).is_file())
            relative2 = app.save(data, token)
            self.assertNotEqual(relative, relative2)
            self.assertTrue(app.authorize_page("/aipm/%E9%A1%B9%E7%9B%AEA/b-test1234/review/index.html", token))
            self.assertFalse(app.authorize_page("/aipm/%E9%A1%B9%E7%9B%AEA/b-test1234/review/index.html", "wrong"))
            self.assertTrue(app.authorize_page("/aipm/%E9%A1%B9%E7%9B%AEA/b-test1234/index.html", "", f"aipm_access={token}"))

    def test_feedback_http_health_and_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec_hash = "e" * 64
            policy = {"项目A/" + spec_hash: {"build_id": "b-test5678", "access_mode": "public", "path_prefix": "/aipm/%E9%A1%B9%E7%9B%AEA/b-test5678/", "feedback_dir": "项目A/b-test5678/feedback"}}
            app = feedback.FeedbackApp(root, policy)
            server = feedback.make_server(app, "127.0.0.1", 0)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                url = f"http://127.0.0.1:{server.server_port}/__aipm_health__"
                with urlopen(url, timeout=2) as response:
                    self.assertEqual(response.status, 200)
                auth_request = Request(f"http://127.0.0.1:{server.server_port}/__aipm_auth__", headers={"X-AIPM-Path": "/aipm/%E9%A1%B9%E7%9B%AEA/b-test5678/review/index.html"})
                with urlopen(auth_request, timeout=2) as response:
                    self.assertEqual(response.status, 200)
                data = {"schema_version": 1, "project": "项目A", "spec_hash": spec_hash,
                        "stage": "annotation", "exported_at": "2026-10-13T10:00:00+08:00", "items": []}
                request = Request(f"http://127.0.0.1:{server.server_port}/__aipm_feedback__", data=json.dumps(data).encode(), method="POST", headers={"Content-Type": "application/json"})
                with urlopen(request, timeout=2) as response:
                    body = json.loads(response.read())
                    self.assertTrue(body["ok"])
            finally:
                server.shutdown()
                server.server_close()


if __name__ == "__main__":
    unittest.main()
