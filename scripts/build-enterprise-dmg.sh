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

# 5. JSX：{/* Manual update check */} 整块（精确起止）
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

# ── 查找构建产物 ─────────────────────────────────────────────────────────────
APP_BUNDLE=$(find "$TAURI/target/release/bundle/macos" -name "*.app" 2>/dev/null | head -1)
if [ -z "$APP_BUNDLE" ]; then
    echo "❌ 未找到 .app 产物，请检查构建日志"
    exit 1
fi

# ── Ad-hoc 签名（无证书时避免 macOS "已损坏" 报错）────────────────────────
echo ""
echo "🔏 Ad-hoc 签名（无证书，收件人首次打开需右键→打开）..."
codesign --force --deep --sign - "$APP_BUNDLE"
echo "   签名完成：$(basename "$APP_BUNDLE")"

# ── 重新打包 DMG ─────────────────────────────────────────────────────────────
VERSION=$(python3 -c "import json; print(json.load(open('$CONF.ent.bak'))['version'])")
DEST="$ROOT/AI_PM_v${VERSION}_enterprise.dmg"
APP_NAME=$(basename "$APP_BUNDLE")

echo ""
echo "📦 重新打包 DMG..."
TMPDIR=$(mktemp -d)
cp -R "$APP_BUNDLE" "$TMPDIR/"
hdiutil create \
    -volname "AI PM v${VERSION}" \
    -srcfolder "$TMPDIR" \
    -ov -format UDZO \
    -o "$DEST"
rm -rf "$TMPDIR"

echo ""
echo "✅ 企业版 DMG 已生成："
echo "   $DEST"
echo "   大小：$(du -sh "$DEST" | cut -f1)"
echo ""
echo "📋 分发说明（告知收件人）："
echo "   首次打开时若提示"无法验证开发者"，右键点击应用→选择"打开"即可。"
echo "   若仍提示问题，终端执行：xattr -cr /Applications/${APP_NAME}"
