from __future__ import annotations
import hashlib, io, os, sys, tempfile, unittest, zipfile
from pathlib import Path
REPO=Path(__file__).resolve().parents[1]; FIX=REPO/"tests/fixtures/setup"; sys.path.insert(0,str(REPO/".claude/skills/ai-pm-setup/scripts"))
import setup_android as sa
def fx(n): return (FIX/n).read_text(encoding="utf-8")
def make_zip(entries):
    b=io.BytesIO()
    with zipfile.ZipFile(b,"w") as z:
        for n,d in entries.items(): z.writestr(n,d)
    return b.getvalue()
class DeviceTests(unittest.TestCase):
    def test_states(self):
        cases={"adb-devices-none.txt":"NO_DEVICE","adb-devices-unauthorized.txt":"UNAUTHORIZED","adb-devices-offline.txt":"OFFLINE","adb-devices-nopermission.txt":"NO_PERMISSION","adb-devices-two-phones.txt":"MULTIPLE","adb-devices-same-model.txt":"MULTIPLE","adb-devices-usb-plus-wireless.txt":"OK"}
        for n,c in cases.items(): self.assertEqual(sa.classify(sa.parse_devices(fx(n))),c)
    def test_pick(self):
        d=sa.parse_devices(fx("adb-devices-two-phones.txt")); self.assertIsNone(sa.pick_serial(d,None)); self.assertEqual(sa.pick_serial(d,"BBB222"),"BBB222")
    def test_windows_candidates(self):
        c=sa.adb_candidates("windows",{"ANDROID_HOME":"D:\\sdk","LOCALAPPDATA":"C:\\Users\\u\\AppData\\Local"},"C:\\Users\\u","C:\\Users\\u\\.ai-pm\\tools")
        self.assertEqual([x[0] for x in c],["ANDROID_HOME","android-studio","aipm-shared"])
    def test_zip_slip_and_symlink(self):
        d=Path(tempfile.mkdtemp()); bad=d/"bad.zip"; bad.write_bytes(make_zip({"..\\evil":b"x"}))
        with self.assertRaises(ValueError): sa.safe_extract(bad,d/"out","mac")
    def test_install_checksum_fallback(self):
        d=Path(tempfile.mkdtemp()); payload=make_zip({"platform-tools/adb":b"x"}); pin={"channels":["https://a/","https://b/"],"assets":{"darwin":{"file":"pt.zip","sha1":hashlib.sha1(payload).hexdigest()}}}
        def fetch(url,dest,timeout): Path(dest).write_bytes(b"<html>" if url.startswith("https://a") else payload)
        r=sa.install_platform_tools(pin,"mac",d,fetch); self.assertTrue(r["ok"]); self.assertTrue((d/"android-sdk/platform-tools/adb").exists())
