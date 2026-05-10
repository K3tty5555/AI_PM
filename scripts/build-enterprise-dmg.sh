#!/bin/bash
# 企业版 DMG 构建脚本（无自动更新、无 GitHub 端点）
# 用法：bash build-enterprise-dmg.sh
# 产物：AI_PM_v<version>_enterprise.dmg（项目根目录）

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/app"
TAURI="$APP/src-tauri"

CARGO="$TAURI/Cargo.toml"
MOD_RS="$TAURI/src/commands/mod.rs"
LIB_RS="$TAURI/src/lib.rs"
CONF="$TAURI/tauri.conf.json"
CAPS="$TAURI/capabilities/default.json"
ABOUT_TSX="$APP/src/pages/settings/SettingsAbout.tsx"

# ── 备份 & 还原 ─────────────────────────────────────────────────────────────
backup() {
    cp "$CARGO"   "$CARGO.ent.bak"
    cp "$MOD_RS"  "$MOD_RS.ent.bak"
    cp "$LIB_RS"  "$LIB_RS.ent.bak"
    cp "$CONF"    "$CONF.ent.bak"
    cp "$CAPS"      "$CAPS.ent.bak"
    cp "$ABOUT_TSX" "$ABOUT_TSX.ent.bak"
    echo "[backup] 原始文件已备份（6 个）"
}

restore() {
    mv "$CARGO.ent.bak"     "$CARGO"     2>/dev/null || true
    mv "$MOD_RS.ent.bak"    "$MOD_RS"    2>/dev/null || true
    mv "$LIB_RS.ent.bak"    "$LIB_RS"    2>/dev/null || true
    mv "$CONF.ent.bak"      "$CONF"      2>/dev/null || true
    mv "$CAPS.ent.bak"      "$CAPS"      2>/dev/null || true
    mv "$ABOUT_TSX.ent.bak" "$ABOUT_TSX" 2>/dev/null || true
    echo "[restore] 源文件已还原"
}

trap restore EXIT

backup

# ── Patch 1：Cargo.toml 移除 updater 依赖 ──────────────────────────────────
echo "[patch] Cargo.toml"
grep -v 'tauri-plugin-updater' "$CARGO.ent.bak" > "$CARGO"

# ── Patch 2：commands/mod.rs 移除 update 模块导出 ───────────────────────────
echo "[patch] commands/mod.rs"
grep -v 'pub mod update;' "$MOD_RS.ent.bak" > "$MOD_RS"

# ── Patch 3：lib.rs — plugin + 两个命令 handler + 菜单项 ────────────────────
echo "[patch] lib.rs"
python3 -c "
import re, sys

with open('$LIB_RS.ent.bak') as f:
    code = f.read()

code = re.sub(r'\s*\.plugin\(tauri_plugin_updater::Builder::new\(\)\.build\(\)\)', '', code)
code = re.sub(r'[ \t]*commands::update::check_update,\n', '', code)
code = re.sub(r'[ \t]*commands::update::download_and_install_update,\n', '', code)
code = re.sub(r'[ \t]*\.text\(\"check-update\",\s*\"检查更新\"\)', '', code)

with open('$LIB_RS', 'w') as f:
    f.write(code)
print('lib.rs patched')
"

# ── Patch 4：tauri.conf.json 移除 plugins.updater ───────────────────────────
echo "[patch] tauri.conf.json"
python3 -c "
import json

with open('$CONF.ent.bak') as f:
    cfg = json.load(f)
cfg.get('plugins', {}).pop('updater', None)
if 'plugins' in cfg and not cfg['plugins']:
    del cfg['plugins']
with open('$CONF', 'w') as f:
    json.dump(cfg, f, indent=2, ensure_ascii=False)
    f.write('\n')
print('tauri.conf.json patched')
"

# ── Patch 5：capabilities/default.json 移除 updater:default 权限 ────────────
echo "[patch] capabilities/default.json"
python3 -c "
import json

with open('$CAPS.ent.bak') as f:
    cfg = json.load(f)
cfg['permissions'] = [p for p in cfg.get('permissions', []) if not p.startswith('updater')]
with open('$CAPS', 'w') as f:
    json.dump(cfg, f, indent=2, ensure_ascii=False)
    f.write('\n')
print('capabilities/default.json patched')
"

# ── Patch 6：SettingsAbout.tsx 移除 GitHub 链接 + 更新检查 UI ────────────────
echo "[patch] SettingsAbout.tsx"
python3 - "$ABOUT_TSX.ent.bak" "$ABOUT_TSX" <<'PYEOF'
import sys, re

src, dst = sys.argv[1], sys.argv[2]
with open(src) as f:
    code = f.read()

# 1. import 行：移除 ExternalLink / openUrl / checkUpdate / downloadAndInstallUpdate / UpdateInfo
code = re.sub(r',\s*ExternalLink\b', '', code)
code = re.sub(r',\s*checkUpdate\b', '', code)
code = re.sub(r',\s*downloadAndInstallUpdate\b', '', code)
code = re.sub(r',\s*UpdateInfo\b', '', code)
# openUrl 整行 import
code = re.sub(r'import \{ open as openUrl \} from "@tauri-apps/plugin-shell"\n', '', code)

# 2. state：精确字符串替换
for exact in (
    '  const [checkingUpdate, setCheckingUpdate] = useState(false)\n',
    '  const [manualUpdateInfo, setManualUpdateInfo] = useState<UpdateInfo | null>(null)\n',
    '  const [manualUpdateState, setManualUpdateState] = useState<\n    "idle" | "available" | "downloading" | "ready" | "none" | "check-error" | "download-error"\n  >("idle")\n',
):
    code = code.replace(exact, '')

# 3 & 4. 函数：用精确文本替换
CHECK_UPDATE_FN = '''
  const handleCheckUpdate = async () => {
    setCheckingUpdate(true)
    setManualUpdateState("idle")
    setManualUpdateInfo(null)
    try {
      const info = await checkUpdate()
      if (info.available) {
        setManualUpdateInfo(info)
        setManualUpdateState("available")
      } else {
        setManualUpdateState("none")
      }
    } catch (err) {
      console.error("[Settings] check update failed", err)
      setManualUpdateState("check-error")
    } finally {
      setCheckingUpdate(false)
    }
  }
'''
MANUAL_DOWNLOAD_FN = '''
  const handleManualDownload = async () => {
    setManualUpdateState("downloading")
    try {
      await downloadAndInstallUpdate()
      setManualUpdateState("ready")
    } catch (err) {
      console.error("[Settings] download update failed", err)
      setManualUpdateState("download-error")
    }
  }
'''
code = code.replace(CHECK_UPDATE_FN, '\n')
code = code.replace(MANUAL_DOWNLOAD_FN, '\n')

# 5. JSX：GitHub 链接 button（精确文本）
GITHUB_BTN = '''            <button
              type="button"
              onClick={() => openUrl("https://github.com/K3tty5555/AI_PM")}
              className="flex w-fit items-center gap-1.5 text-sm text-[var(--accent-color)] hover:underline"
            >
              <ExternalLink className="size-3.5" strokeWidth={1.75} />
              github.com/K3tty5555/AI_PM
            </button>
'''
code = code.replace(GITHUB_BTN, '')

# 6. JSX：{/* Manual update check */} 整块（精确起止）
idx_start = code.find('\n            {/* Manual update check */}')
if idx_start != -1:
    # 找 mt-1 div 的闭合 </div>（在 start 之后第一个 "\n            </div>"）
    END_TAG = '\n            </div>'
    idx_end = code.find(END_TAG, idx_start)
    if idx_end != -1:
        code = code[:idx_start] + code[idx_end + len(END_TAG):]

with open(dst, 'w') as f:
    f.write(code)

keywords = ['checkUpdate','downloadAndInstall','UpdateInfo','checkingUpdate',
            'manualUpdate','handleManual','openUrl','ExternalLink','github.com']
remaining = [l for l in code.split('\n') if any(k in l for k in keywords)]
print(f'SettingsAbout.tsx patched，剩余 updater 相关行: {len(remaining)}')
for l in remaining:
    print(' >', repr(l[:100]))
print(f'行数: {len(open(src).readlines())} → {len(code.splitlines())}')
PYEOF

# ── 构建 ─────────────────────────────────────────────────────────────────────
echo ""
echo "🔨 开始构建企业版（Tauri release build）..."
cd "$APP"
npm run tauri build

# ── 查找 DMG 并复制到根目录 ──────────────────────────────────────────────────
DMG=$(find "$TAURI/target/release/bundle/dmg" -name "*.dmg" 2>/dev/null | head -1)
if [ -z "$DMG" ]; then
    echo "❌ 未找到 DMG 产物，请检查构建日志"
    exit 1
fi

VERSION=$(python3 -c "import json; print(json.load(open('$CONF.ent.bak'))['version'])")
DEST="$ROOT/AI_PM_v${VERSION}_enterprise.dmg"
cp "$DMG" "$DEST"

echo ""
echo "✅ 企业版 DMG 已生成："
echo "   $DEST"
echo "   大小：$(du -sh "$DEST" | cut -f1)"
