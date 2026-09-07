"""Cross-version visual packages must not become current authority."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

CHECK=Path(__file__).resolve().parent/'ai-sync/check-visual-anchor-package.js'

class VisualAnchorFreshnessTests(unittest.TestCase):
    def run_case(self, active='current.md', source='current.md', spec_hash=None):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);visual=root/'06-prototype-visual/current';visual.mkdir(parents=True)
            (root/'.ai-pm-config.json').write_text(json.dumps({'visualPackagePath':'06-prototype-visual/current'}))
            (root/'_status.json').write_text(json.dumps({'active_prd':active}))
            (root/'06-prototype').mkdir();(root/'06-prototype/prototype-spec.json').write_text('{}')
            (visual/'visual-fingerprint.md').write_text('test')
            (visual/'screen.png').write_bytes(b'fixture')
            manifest={'packageType':'visual-anchor-manifest','status':'ready','sourcePrd':source,'images':[{'pageId':'home','image':'screen.png'}]}
            if spec_hash: manifest['sourceSpecHash']=spec_hash
            (visual/'manifest.json').write_text(json.dumps(manifest))
            # There is also a legacy ready package; the explicit pointer must win.
            (root/'06-prototype-visual/manifest.json').write_text('{}')
            return subprocess.run(['node',str(CHECK),str(root)],capture_output=True,text=True)

    def test_explicit_current_package_is_selected(self):
        result=self.run_case()
        self.assertEqual(result.returncode,0,result.stdout)
        self.assertIn('06-prototype-visual/current/manifest.json',result.stdout)

    def test_ready_from_another_prd_is_stale(self):
        result=self.run_case(source='../05-prd/previous.md')
        self.assertEqual(result.returncode,2)
        self.assertIn('STATUS: stale',result.stdout)

    def test_changed_spec_is_stale(self):
        self.assertEqual(self.run_case(spec_hash='outdated').returncode,2)

    def test_matching_spec_is_current(self):
        import hashlib
        self.assertEqual(self.run_case(spec_hash=hashlib.sha256(b'{}').hexdigest()).returncode,0)

if __name__=='__main__':unittest.main()
