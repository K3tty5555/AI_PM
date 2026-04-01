# PRD Mermaid 渲染迁移至 baoyu-imagine 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 ai-pm-prd skill 的 Mermaid 渲染路径统一迁移至用户级 baoyu-imagine skill，DOCX 和 PDF 导出均生效，同步清理废弃的 preprocess_mermaid.py 和 illustration.md 内的直调 Seedream 逻辑。

**Architecture:** 步骤6 改为调用 `~/.bun/bin/bun baoyu-imagine --batchfile` 批量生成图片，生成临时导出副本（Mermaid 块替换为 `![](path)`），DOCX/PDF 均使用副本。原始 PRD 保持不动。

**Tech Stack:** Markdown 文件编辑，JavaScript（build-pdf-html.js），无新依赖

---

## 背景速查

相关文件：
- `.claude/skills/ai-pm-prd/SKILL.md`（504行）— 步骤4.5a（L98-106）、步骤6（L151-175）、PDF导出路径B（L428-459）
- `.claude/skills/ai-pm-prd/build-pdf-html.js` — Markdown→HTML 转换，需新增 `![](path)` 支持
- `.claude/skills/ai-pm-prd/preprocess_mermaid.py` — 待删除
- `.claude/skills/ai-pm/illustration.md`（94行）— 待修改，第4步"生成图片"替换为 baoyu-imagine

baoyu-imagine 调用方式（bun 路径发现）：
```bash
BUN="${HOME}/.bun/bin/bun"
# 回退：npx -y bun
${BUN} ~/.claude/skills/baoyu-imagine/scripts/main.ts \
  --batchfile /tmp/{slug}-mermaid-batch.json
```

batch.json 格式参见：`~/.claude/skills/baoyu-imagine/SKILL.md` 的 Batch File Format 节。

---

### Task 1: 修复 SKILL.md 步骤4.5a

**Files:**
- Modify: `.claude/skills/ai-pm-prd/SKILL.md:98-106`

**Step 1: 定位当前内容**

读 SKILL.md L98-107，确认要替换的文字：
```
### 步骤4.5a：流程图生成方式选择

导出 DOCX 时，如果 PRD 中包含 Mermaid 代码块，md2docx.py 会逐个询问生成方式：
- **A. AI 生成高清信息图**（Seedream，会产生 API 费用）→ 需确认风格后生成，图片同时保存到 `11-illustrations/`
- **B. 本地渲染**（Chrome headless，免费但质量一般）→ 默认选项

选择 A 后需二次确认风格（推荐布局×风格组合 + 确认），确认后才调用 API。生成失败不自动重试（避免双倍费用）。

非交互模式（客户端调用）自动走 B 本地渲染，不弹确认。
```

**Step 2: 替换为新内容**

用 Edit 工具将整个步骤4.5a 替换为：

```markdown
### 步骤4.5a：流程图生成方式

PRD 中包含 Mermaid 代码块时，生成方式取决于执行环境：

- **Claude Code 环境**：步骤6 负责调用 baoyu-imagine 批量生成 AI 图片，不走 md2docx.py 内部渲染
- **用户手动在终端执行 md2docx.py（TTY 模式）**：脚本逐个询问 A（AI高清/Seedream）或 B（本地Chrome），按用户选择执行
```

**Step 3: 验证**

```bash
grep -n "非交互模式\|自动走 B\|本地渲染，不弹" .claude/skills/ai-pm-prd/SKILL.md
```
预期：无输出（该句已删除）

**Step 4: Commit**

```bash
git add .claude/skills/ai-pm-prd/SKILL.md
git commit -m "fix(skill): 步骤4.5a 删除「非交互模式走本地渲染」冲突描述"
```

---

### Task 2: 重写 SKILL.md 步骤6

**Files:**
- Modify: `.claude/skills/ai-pm-prd/SKILL.md:151-175`

**Step 1: 定位当前步骤6（L151-175）**

当前内容是"调用 illustration.md 中的逻辑"、"在代码块下方插入图片引用"——两处都要改。

**Step 2: 替换为新内容**

用 Edit 工具将步骤6整体替换为：

```markdown
### 步骤 6：批量 AI 配图（仅 ai_illustration_mode=true 时执行）

1. 扫描当前 PRD 文件，提取所有 Mermaid 代码块
2. 展示扫描结果：

```
发现 {N} 个 Mermaid 流程图，预计费用约 {N×0.2} 元（每张约 0.1-0.3 元）。

确认生成？（y/n）
```

3. 用户确认后：

   a. 为每个 Mermaid 块构建 prompt 文件，保存到 `/tmp/{项目slug}-flow{编号}.md`：
      ```
      专业产品流程信息图，扁平矢量 corporate-memphis 风格，纯白色背景(#FFFFFF)，蓝色系配色(主色#1D4ED8)。
      中文标注，清晰可读，简洁专业，适合嵌入PRD文档。充足留白，节点间用带箭头连接线。
      布局类型：{根据内容选 tree-branching / linear-progression / hub-spoke}。

      流程内容（基于以下 Mermaid 代码转化为可视化信息图）：
      {Mermaid 代码内容，去掉 ``` 标记}
      ```

   b. 构建 `/tmp/{项目slug}-mermaid-batch.json`：
      ```json
      {
        "jobs": 3,
        "tasks": [
          {
            "id": "flow{编号}",
            "promptFiles": ["/tmp/{项目slug}-flow{编号}.md"],
            "image": "{项目目录}/11-illustrations/{编号}-{slug}.png",
            "provider": "seedream",
            "ar": "16:9",
            "quality": "2k"
          }
        ]
      }
      ```

   c. 调用 baoyu-imagine 批量生成：
      ```bash
      BUN="${HOME}/.bun/bin/bun"
      # bun 不存在时回退：BUN="npx -y bun"
      "${BUN}" ~/.claude/skills/baoyu-imagine/scripts/main.ts \
        --batchfile /tmp/{项目slug}-mermaid-batch.json
      ```

   d. 生成临时导出副本（原始 PRD 保持不动）：
      - 读取原始 PRD
      - 将每个 Mermaid 代码块（````mermaid...` `` ` `）替换为 `![{描述}](../11-illustrations/{编号}-{slug}.png)`
      - 写入 `{项目目录}/05-prd/_export_tmp.md`

   e. DOCX/PDF 导出均使用 `_export_tmp.md`，完成后删除：
      ```bash
      rm "{项目目录}/05-prd/_export_tmp.md"
      rm /tmp/{项目slug}-flow*.md
      rm /tmp/{项目slug}-mermaid-batch.json
      ```

4. 所有图片生成完毕后输出汇总：

```
✅ 已生成 {N} 张 AI 配图，嵌入导出文档
```
```

**Step 3: 验证**

```bash
grep -n "illustration.md 中的逻辑\|下方插入图片引用\|倒序处理" .claude/skills/ai-pm-prd/SKILL.md
```
预期：无输出

**Step 4: Commit**

```bash
git add .claude/skills/ai-pm-prd/SKILL.md
git commit -m "feat(skill): 步骤6 改用 baoyu-imagine batch 生成流程图"
```

---

### Task 3: 更新 SKILL.md PDF 导出路径 B

**Files:**
- Modify: `.claude/skills/ai-pm-prd/SKILL.md:326-459`

**Step 1: 定位要修改的内容**

L326-336：含 preprocess_mermaid.py 的 Mermaid 预处理说明块
L428-459：路径B的具体命令（含 preprocess_mermaid.py 调用）

**Step 2: 替换 L326-336 预处理说明**

将这段：
```markdown
**含图片路径（B/C/D/E）的 Mermaid 预处理**（在 HTML 构建之前执行）：

```bash
# 预渲染 Mermaid 流程图 → 生成临时 MD（mermaid 块替换为 base64 <img>）
python3 "$SKILL_DIR/preprocess_mermaid.py" \
  "{项目目录}/05-prd/05-PRD-v1.0.md" \
  "{项目目录}/05-prd/_tmp_preprocessed.md"

# 后续 HTML 构建使用 _tmp_preprocessed.md 而非原始 MD
# 最终清理：rm "{项目目录}/05-prd/_tmp_preprocessed.md"
```
```

替换为：
```markdown
**含图片路径（B/C/D/E）的 Mermaid 处理**：

ai_illustration_mode=true 时，步骤6 已将 Mermaid 块替换为 `![](path)` 并生成 `_export_tmp.md`，路径B/C/D/E 直接使用该副本，无需额外预处理。build-pdf-html.js 原生支持 `![alt](path)` → base64 img 嵌入。
```

**Step 3: 替换路径B命令（L428-459）**

将路径B整体替换为：

```markdown
#### 路径 B：含原型截图 + 流程图版（30-40 秒）

> 使用步骤6生成的 `_export_tmp.md`（Mermaid 已替换为 AI 图片引用）。

```bash
# 1. 构建 HTML（用 _export_tmp.md，含 AI 流程图 + 原型截图）
node -e "
const { buildHtml } = require('./build-pdf-html.js');
const fs = require('fs');
const html = buildHtml(
  '{项目目录}/05-prd/_export_tmp.md',
  'templates/prd-styles/default/pdf-style.css',
  true    // ← 嵌入原型截图
);
fs.writeFileSync('{项目目录}/05-prd/_tmp_illustrated.html', html);
"

# 2. 打印 PDF
"$CHROME" --headless=new --no-sandbox --disable-gpu \
  --print-to-pdf="{项目目录}/05-prd/05-PRD-v1.0-illustrated.pdf" \
  --print-to-pdf-no-header \
  "file://{项目目录}/05-prd/_tmp_illustrated.html" 2>/dev/null

# 3. 清理
rm "{项目目录}/05-prd/_tmp_illustrated.html"
# _export_tmp.md 由步骤6统一清理
```
```

**Step 4: 验证**

```bash
grep -n "preprocess_mermaid\|_tmp_preprocessed" .claude/skills/ai-pm-prd/SKILL.md
```
预期：无输出

**Step 5: Commit**

```bash
git add .claude/skills/ai-pm-prd/SKILL.md
git commit -m "fix(skill): PDF导出路径B替换为使用_export_tmp.md，删除preprocess_mermaid.py引用"
```

---

### Task 4: 更新 build-pdf-html.js，支持 `![alt](path)` 图片

**Files:**
- Modify: `.claude/skills/ai-pm-prd/build-pdf-html.js:368-384`

**Step 1: 定位插入位置**

在 `// Markdown → HTML（标题/表格/列表/粗体/代码）` 这行之后，`let html = md` 之前，插入图片预处理逻辑。

**Step 2: 插入代码**

在 `let html = md` 之前，新增以下图片处理（读文件→base64→figure 标签）：

```javascript
  // Markdown 图片语法 ![alt](path) → base64 <figure>
  const prdDir = path.dirname(prdPath);
  md = md.replace(/^!\[([^\]]*)\]\(([^)]+)\)$/gm, (match, alt, imgPath) => {
    const abs = path.resolve(prdDir, imgPath);
    if (!fs.existsSync(abs)) return match;
    try {
      const ext = path.extname(abs).slice(1).toLowerCase().replace('jpg', 'jpeg');
      const b64 = fs.readFileSync(abs).toString('base64');
      return '<figure class="flow-figure">'
        + '<img src="data:image/' + ext + ';base64,' + b64 + '" alt="' + alt + '" '
        + 'style="max-width:100%;border-radius:6px;margin:8pt 0;">'
        + (alt ? '<figcaption style="text-align:center;font-size:9pt;color:#86868b;margin-top:4pt;">' + alt + '</figcaption>' : '')
        + '</figure>';
    } catch (e) {
      return match;
    }
  });
```

同时在 `html = html.split('\n\n').map(...)` 中，确保 `<figure` 开头的块不被包裹 `<p>`。当前代码已有 `block.match(/^<(h[1-4]|ul|hr|pre|figure)/)` 的判断，**无需改动**。

**Step 3: 验证逻辑**

用 `node` 手动测试（在 AI_PM 根目录下）：

```bash
node -e "
const { buildHtml } = require('.claude/skills/ai-pm-prd/build-pdf-html.js');
const fs = require('fs');
// 创建一个包含图片引用的临时测试 md
fs.writeFileSync('/tmp/test-img.md', '# Test\n\n![场景路由流程图](output/projects/教育超级智能体/11-illustrations/flow1-scene-routing.png)\n');
const html = buildHtml('/tmp/test-img.md', 'templates/prd-styles/default/pdf-style.css', false);
const hasImg = html.includes('data:image/');
console.log('图片嵌入成功:', hasImg);
fs.unlinkSync('/tmp/test-img.md');
"
```
预期输出：`图片嵌入成功: true`

**Step 4: Commit**

```bash
git add .claude/skills/ai-pm-prd/build-pdf-html.js
git commit -m "feat(build-pdf-html): 支持 ![alt](path) Markdown 图片语法嵌入 PDF"
```

---

### Task 5: 删除 preprocess_mermaid.py

**Files:**
- Delete: `.claude/skills/ai-pm-prd/preprocess_mermaid.py`

**Step 1: 确认无残留引用**

```bash
grep -rn "preprocess_mermaid" .claude/skills/ 2>/dev/null
```
预期：Tasks 1-3 完成后无任何输出。

**Step 2: 删除文件**

```bash
rm .claude/skills/ai-pm-prd/preprocess_mermaid.py
```

**Step 3: Commit**

```bash
git add -A .claude/skills/ai-pm-prd/preprocess_mermaid.py
git commit -m "chore: 删除 preprocess_mermaid.py（已被 baoyu-imagine 流程替代）"
```

---

### Task 6: 重写 illustration.md，实现替换为 baoyu-imagine

**Files:**
- Modify: `.claude/skills/ai-pm/illustration.md`

**Step 1: 定位要删除的内容**

需要替换的是第4步（L56-63）、API 配置表（L81-88）、与导出流程关系（L90-94）。
风格推荐表（L28-37）和风格确认交互（L39-54）**保留不动**——这是该命令的核心价值。

**Step 2: 替换第4步"生成图片"（L56-63）**

将：
```markdown
### 4. 生成图片

调用 Seedream API（`doubao-seedream-4-5-251128`）生成。

**错误处理**：
- API Key 未配置 → 提示设置 `~/.baoyu-skills/.env` 中的 `ARK_API_KEY`
- 生成失败 → **不自动重试**（避免双倍费用），提示用户决定是否重试
- 网络超时 → 提示检查网络
```

替换为：
```markdown
### 4. 生成图片

调用 baoyu-imagine skill 生成（自动读取用户 `~/.baoyu-skills/baoyu-imagine/EXTEND.md` 配置）：

```bash
BUN="${HOME}/.bun/bin/bun"
"${BUN}" ~/.claude/skills/baoyu-imagine/scripts/main.ts \
  --prompt "{构建好的 prompt}" \
  --image "{项目目录}/11-illustrations/{编号}-{slug}.png" \
  --ar 16:9
```

**错误处理**：baoyu-imagine 内置 3 次自动重试；Key 未配置时提示检查 `~/.baoyu-skills/baoyu-imagine/EXTEND.md`。
```

**Step 3: 替换 API 配置表（L81-88）**

将整个 `## API 配置` 节替换为：

```markdown
## 配置

provider、model、quality 由用户 `~/.baoyu-skills/baoyu-imagine/EXTEND.md` 决定，默认为 Seedream 2K。
修改配置：编辑该文件或运行 `baoyu-imagine` 首次安装流程。
```

**Step 4: 替换"与导出流程的关系"（L90-94）**

将整节替换为：

```markdown
## 与导出流程的关系

- **独立命令**：用户主动调用 `/ai-pm illustration`，生成单张图片
- **导出流程**：ai-pm-prd 的步骤6 使用 baoyu-imagine batch 模式批量生成，无需单独调用本命令
```

**Step 5: 验证**

```bash
grep -n "Seedream API\|doubao-seedream\|ARK_API_KEY\|urllib\|不自动重试" .claude/skills/ai-pm/illustration.md
```
预期：无输出（直调 Seedream 痕迹已清除）

**Step 6: Commit**

```bash
git add .claude/skills/ai-pm/illustration.md
git commit -m "refactor(illustration): 生成层替换为调用 baoyu-imagine，保留风格选择交互"
```

---

## 整体验证

所有 Task 完成后，运行以下检查：

```bash
# 1. 无残留的直调 Seedream 或 preprocess_mermaid 引用
grep -rn "preprocess_mermaid\|非交互模式.*本地渲染\|illustration.md 中的逻辑" .claude/skills/

# 2. 步骤6 包含 baoyu-imagine 调用
grep -n "baoyu-imagine\|bun.*main.ts\|batchfile" .claude/skills/ai-pm-prd/SKILL.md

# 3. build-pdf-html.js 包含图片处理
grep -n "data:image\|base64\|flow-figure" .claude/skills/ai-pm-prd/build-pdf-html.js

# 4. preprocess_mermaid.py 已不存在
ls .claude/skills/ai-pm-prd/preprocess_mermaid.py 2>/dev/null && echo "ERROR: 文件未删除" || echo "OK: 已删除"
```

全部通过即完成。
