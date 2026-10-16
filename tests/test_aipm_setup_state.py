from __future__ import annotations
import json, multiprocessing, sys, tempfile, time, unittest
from pathlib import Path
REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / ".claude/skills/ai-pm-setup/scripts"))
import setup_state

def _writer(state, lock, prefix, n):
    for i in range(n):
        setup_state.set_value(Path(state), Path(lock), "%s%d" % (prefix, i), "consent", True)

class StateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp()); self.state = self.tmp / "s.json"; self.lock = self.tmp / "s.lock"
    def test_empty_and_bom(self):
        self.assertEqual(setup_state.load_state(self.state), {"schema_version": 1, "targets": {}})
        self.state.write_text('\ufeff{"schema_version":1,"targets":{"web":{"consent":true}}}', encoding="utf-8")
        self.assertTrue(setup_state.load_state(self.state)["targets"]["web"]["consent"])
    def test_unknown_key(self):
        with self.assertRaises(ValueError): setup_state.set_value(self.state, self.lock, "android", "ready", True)
    def test_persist_and_release(self):
        setup_state.set_value(self.state, self.lock, "android", "device_serial", "abc")
        self.assertEqual(json.loads(self.state.read_text())["targets"]["android"]["device_serial"], "abc")
        self.assertFalse(self.lock.exists())
    def test_busy_and_stale(self):
        self.lock.write_text("999")
        with self.assertRaises(setup_state.LockBusy):
            with setup_state.file_lock(self.lock, timeout=0.05): pass
        old = time.time() - 1000; self.lock.touch(); import os; os.utime(self.lock, (old, old))
        with setup_state.file_lock(self.lock, timeout=0.2): pass
    def test_concurrent_writers(self):
        ps = [multiprocessing.Process(target=_writer, args=(str(self.state), str(self.lock), p, 8)) for p in ("a", "b")]
        for p in ps: p.start()
        for p in ps: p.join(10)
        self.assertEqual(len(setup_state.load_state(self.state)["targets"]), 16)
