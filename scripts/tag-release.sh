#!/bin/bash
# 用法: ./scripts/tag-release.sh 0.4.2
# 自动完成：版本号对齐 → lock 文件同步 → 本地编译验证 → commit → tag → push
set -e

VERSION="$1"
if [ -z "$VERSION" ]; then
  echo "❌ 用法: ./scripts/tag-release.sh <版本号>  例如: ./scripts/tag-release.sh 0.4.2"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/app"

echo "🚀 准备发布 v$VERSION"

# ── 1. 版本号对齐 ────────────────────────────────────────
echo "📝 更新版本号..."

# tauri.conf.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$APP/src-tauri/tauri.conf.json"

# Cargo.toml（只改第一行 version =）
sed -i '' "1,/^version = /s/^version = \"[^\"]*\"/version = \"$VERSION\"/" "$APP/src-tauri/Cargo.toml"

# package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$APP/package.json"

# 验证
V_TAURI=$(grep '"version"' "$APP/src-tauri/tauri.conf.json" | head -1 | grep -o '"[0-9.]*"' | tr -d '"')
V_CARGO=$(grep '^version = ' "$APP/src-tauri/Cargo.toml" | head -1 | grep -o '"[0-9.]*"' | tr -d '"')
V_NPM=$(grep '"version"' "$APP/package.json" | head -1 | grep -o '"[0-9.]*"' | tr -d '"')

if [ "$V_TAURI" != "$VERSION" ] || [ "$V_CARGO" != "$VERSION" ] || [ "$V_NPM" != "$VERSION" ]; then
  echo "❌ 版本号对齐失败: tauri=$V_TAURI cargo=$V_CARGO npm=$V_NPM"
  exit 1
fi
echo "✅ 版本号对齐: $VERSION"

# ── 2. 同步 package-lock.json ────────────────────────────
echo "📦 同步 package-lock.json..."
cd "$APP" && npm install --package-lock-only --quiet
echo "✅ package-lock.json 已同步"

# ── 3. TypeScript 编译检查 ────────────────────────────────
echo "🔍 TypeScript 编译检查..."
cd "$APP" && npx tsc --noEmit
echo "✅ TypeScript 无错误"

# ── 4. Rust 编译检查 ─────────────────────────────────────
echo "🦀 Rust 编译检查..."
if ! cargo check --manifest-path "$APP/src-tauri/Cargo.toml" --quiet 2>&1; then
  echo "❌ Rust 编译失败"
  exit 1
fi
echo "✅ Rust 无错误"

# ── 5. Commit ────────────────────────────────────────────
echo "💾 提交版本变更..."
cd "$ROOT"
git add app/src-tauri/tauri.conf.json app/src-tauri/Cargo.toml app/src-tauri/Cargo.lock app/package.json app/package-lock.json
git diff --cached --quiet && echo "⚠️  无变更可提交（版本号已是 $VERSION）" || \
  git commit -m "chore: bump version to $VERSION"

# ── 6. Push main ─────────────────────────────────────────
git push origin main

# ── 7. Tag & push ────────────────────────────────────────
echo "🏷️  打 tag v$VERSION..."
git tag -d "v$VERSION" 2>/dev/null && git push origin ":refs/tags/v$VERSION" 2>/dev/null || true
git tag -a "v$VERSION" -m "v$VERSION"
git push origin "v$VERSION"

echo ""
echo "✅ 发布完成！tag v$VERSION 已推送，CI 构建已触发。"
