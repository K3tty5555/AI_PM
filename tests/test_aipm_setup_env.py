from __future__ import annotations
import ntpath, sys, unittest
from pathlib import Path
REPO = Path(__file__).resolve().parents[1]; sys.path.insert(0, str(REPO / ".claude/skills/ai-pm-setup/scripts"))
import setup_env
def fake_run(table):
    return lambda cmd, timeout, cwd=None, env=None: table.get(tuple(cmd), (127, ""))
class EnvTests(unittest.TestCase):
    def test_os_arch_node(self):
        self.assertEqual(setup_env.os_name("win32"), "windows"); self.assertEqual(setup_env.os_name("darwin"), "mac")
        self.assertEqual(setup_env.arch_name("AMD64"), "x64"); self.assertEqual(setup_env.parse_node_version("v20.11.1"), (20,11,1))
    def test_windows_python_and_gitbash(self):
        probe = ("-c", "import sys;print(sys.version.split()[0])")
        run = fake_run({("python3", *probe):(9009,""), ("python", *probe):(0,"3.14.1\r\n")})
        which = lambda name: "C:/x/" + name
        self.assertEqual(setup_env.find_python("windows", run, which)["cmd"], ["python"])
        env={"ProgramFiles":"C:\\Program Files", "ProgramFiles(x86)":"C:\\Program Files (x86)"}; edge=ntpath.join(env["ProgramFiles(x86)"],"Git","bin","bash.exe")
        self.assertEqual(setup_env.find_git_bash("windows", env, lambda n: None, lambda p:p==edge), edge)
    def test_detect(self):
        probe=("python3","-c","import sys;print(sys.version.split()[0])")
        info=setup_env.detect("windows","arm64",{},fake_run({probe:(0,"3.12.0"),("node","--version"):(0,"v18.0.0")}),lambda n:{"python3":"/p","node":"/n","npx":"/x"}.get(n),lambda p:False)
        self.assertIn("NODE_TOO_OLD", info["problems"]); self.assertIn("PYTHON_TOO_OLD", info["problems"]); self.assertIn("ARM64_UNSUPPORTED", info["problems"])
