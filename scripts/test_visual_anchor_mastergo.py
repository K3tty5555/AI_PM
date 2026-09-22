"""设计稿来源的视觉锚点包必须被校验器正确识别。"""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

CHECK = Path(__file__).resolve().parent / 'ai-sync/check-visual-anchor-package.js'


class MasterGoSourceTests(unittest.TestCase):
    def run_case(self, source='mastergo', with_tokens=True, with_structure=True):
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
                'status': 'ready',
                'sourcePrd': 'current.md',
                'source': source,
                'images': [{'pageId': 'entry', 'image': 'images/entry.png'}],
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


if __name__ == '__main__':
    unittest.main()
