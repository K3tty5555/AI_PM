#!/usr/bin/env bash
# 分享就绪自检 —— 把 AI_PM 推广成跨团队/跨行业共享工具前跑一次。
# 拦截「内部公司/产品/真实人名」漏进 git 追踪文件，以及敏感目录被误追踪。
# KettyWu 是工具招牌 persona（作者本人同意署名），白名单放行、不拦。
#
# 用法： bash scripts/check-share-readiness.sh
# 退出码： 0=就绪可分享 / 1=发现泄漏，必须先清

set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

fail=0

# ── 1. 内部名 denylist（追踪文件里出现即泄漏；KettyWu 不在其列）──────────
# 注：用通用占位描述，真实内部名按本机情况维护，不写进可分享文档的正文示例。
DENYLIST='某 K12 教育平台|某 AI 公司|company|某教育 AI 助手|某 AI 助手|某产品|KettyWu|某产品经理|某产品经理|某产品经理|某平台|某角色'

echo "── 1. 扫描追踪文件里的内部名 ──"
hits=$(git ls-files | xargs grep -lE "$DENYLIST" 2>/dev/null | sort -u)
if [ -n "$hits" ]; then
  echo "❌ 以下追踪文件含内部名，分享前必须清成通用占位："
  echo "$hits" | sed 's/^/   /'
  fail=1
else
  echo "✅ 无内部名泄漏"
fi

# ── 2. 敏感目录不得被追踪（应由 .gitignore 挡住）──────────────────────
echo ""
echo "── 2. 敏感目录是否被误追踪 ──"
# 知识库卡片本体（PITFALL/INSIGHT/PATTERN/PLAYBOOK/DECISION）+ 个人 persona 语料
leak2=$(git ls-files \
  'templates/knowledge-base/**/*.md' \
  'templates/persona/*' \
  | grep -viE 'README|\.gitkeep' 2>/dev/null)
if [ -n "$leak2" ]; then
  echo "❌ 以下本应仅本机的文件被 git 追踪了，分享前必须移出："
  echo "$leak2" | sed 's/^/   /'
  fail=1
else
  echo "✅ 知识库卡片 / persona 语料未被追踪（gitignore 生效，空库起步成立）"
fi

# ── 3. 追踪文件里是否残留 source-project 内部项目名 ───────────────────
echo ""
echo "── 3. 追踪文件里的 source-project 内部项目名 ──"
leak3=$(git ls-files | xargs grep -lE '^source-project: .+(某 K12 教育平台|某教育 AI 助手|某产品|辅批|阅卷)' 2>/dev/null | sort -u)
if [ -n "$leak3" ]; then
  echo "❌ 以下追踪文件 frontmatter 残留内部项目名："
  echo "$leak3" | sed 's/^/   /'
  fail=1
else
  echo "✅ 无 source-project 内部项目名泄漏"
fi

echo ""
if [ "$fail" -eq 0 ]; then
  echo "🟢 分享就绪：未发现泄漏，可分发给跨团队/跨行业用户。"
else
  echo "🔴 未就绪：上方 ❌ 项必须先清，再分享。"
fi
exit "$fail"
