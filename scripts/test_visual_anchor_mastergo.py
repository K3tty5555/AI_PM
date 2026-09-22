"""设计稿来源的视觉锚点包必须被校验器正确识别。"""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

CHECK = Path(__file__).resolve().parent / 'ai-sync/check-visual-anchor-package.js'


class MasterGoSourceTests(unittest.TestCase):
    def run_case(self, source='mastergo', with_tokens=True, with_structure=True, status='ready'):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            visual = root / '06-prototype-visual'
            (visual / 'images').mkdir(parents=True)
            (visual / 'structures').mkdir(parents=True)
            (root / '_status.json').write_text(json.dumps({'active_prd': 'current.md'}))
            (visual / 'visual-fingerprint.md').write_text('fixture')
            (visual / 'images/entry.png').write_bytes(b'fixture')
            if with_tokens:
                (visual / 'design-tokens.json').write_text('{"schema_version":1,"colors":[]}')
            if with_structure:
                (visual / 'structures/entry.json').write_text('{"schema_version":1}')
            manifest = {
                'packageType': 'visual-anchor-manifest',
                'status': status,
                'sourcePrd': 'current.md',
                'source': source,
                'images': [{'pageId': 'entry', 'image': 'images/entry.png'}] if status != 'failed' else [],
            }
            (visual / 'manifest.json').write_text(json.dumps(manifest))
            return subprocess.run(['node', str(CHECK), str(root)], capture_output=True, text=True)

    def test_mastergo_ready_package_passes(self):
        result = self.run_case()
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn('STATUS: ready', result.stdout)

    def test_next_action_does_not_mention_codex_for_mastergo(self):
        result = self.run_case()
        self.assertNotIn('Codex', result.stdout)

    def test_codex_source_still_mentions_codex(self):
        result = self.run_case(source='codex', with_tokens=False, with_structure=False)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn('read manifest', result.stdout)

    def test_mastergo_without_design_tokens_is_invalid(self):
        result = self.run_case(with_tokens=False)
        self.assertEqual(result.returncode, 1)
        self.assertIn('design-tokens.json', result.stdout)

    def test_mastergo_without_structure_for_a_page_is_invalid(self):
        result = self.run_case(with_structure=False)
        self.assertEqual(result.returncode, 1)
        self.assertIn('structures/entry.json', result.stdout)

    def test_partial_mastergo_next_action_mentions_ingest_design(self):
        # 降级包的下一步要指回 ingest-design 重跑，而不是把人引去 Codex
        result = self.run_case(status='partial')
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn('ingest-design', result.stdout)
        self.assertNotIn('Codex', result.stdout)

    def test_failed_mastergo_next_action_mentions_ingest_design(self):
        result = self.run_case(status='failed')
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn('STATUS: failed', result.stdout)
        self.assertIn('ingest-design', result.stdout)
        self.assertNotIn('Codex', result.stdout)


class RequestRoutingTests(unittest.TestCase):
    """requestSource 只认 designSource.provider=mastergo，不看 truthiness。"""

    def run_request_only(self, request):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            visual = root / '06-prototype-visual'
            visual.mkdir(parents=True)
            (visual / 'request.json').write_text(json.dumps(request))
            return subprocess.run(['node', str(CHECK), str(root)], capture_output=True, text=True)

    def test_mastergo_provider_request_routes_to_ingest_design(self):
        result = self.run_request_only({
            'packageType': 'visual-anchor-request', 'gateMode': 'strict',
            'designSource': {'provider': 'mastergo', 'fileId': '9', 'layerIds': ['1:1']},
        })
        self.assertEqual(result.returncode, 2, result.stdout)
        self.assertIn('ingest-design', result.stdout)
        self.assertNotIn('Codex', result.stdout)

    def test_non_mastergo_design_source_is_not_misrouted(self):
        # 脏数据/别的 provider 不许被 truthiness 判成 mastergo 流
        result = self.run_request_only({
            'packageType': 'visual-anchor-request', 'gateMode': 'strict',
            'designSource': {'provider': 'figma'},
        })
        self.assertEqual(result.returncode, 2, result.stdout)
        self.assertIn('Codex', result.stdout)


if __name__ == '__main__':
    unittest.main()
