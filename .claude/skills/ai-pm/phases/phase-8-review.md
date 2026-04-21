# Phase 8: 需求评审

**输入**: `05-prd/` 下最新版本 PRD MD + `06-prototype/index.html`（可选）+ `_memory/L2-prd-versions.md`（若存在）
**输出**: `08-review-report-v1.md`

## 参考文档读取（各阶段前置，自动执行）

在执行本阶段任何操作前，扫描 `{project_dir}/05-prd/` 和 `{project_dir}/07-references/` 下的参考文档并载入上下文：

### 1. PDF 文件（视觉读取，保留截图/流程图/原型）

```bash
ls "{project_dir}/05-prd/"*.pdf "{project_dir}/07-references/"*.pdf 2>/dev/null
```

对每个 PDF，渲染为 PNG 图像（已渲染则跳过）：
```bash
python3 .claude/skills/ai-pm/scripts/pdf_to_images.py "{pdf_path}"
# 输出 IMAGES:<dir>:<count> 表示渲染完成，CACHED:<dir>:<count> 表示已有缓存
```

渲染后使用 Read 工具逐页读取 PNG（每次读 2 页），完整浏览全部页面，提取版本摘要追加到 `_memory/L2-prd-versions.md`（不存在则创建）：
- 版本标识：从文件名提取（如 `V1`、`V2`，无法提取则用文件名前 20 字符）
- 摘要：≤30 字描述功能范围
- 关键变化：与上一版相比新增/删除了什么（首版写"初版"）

### 2. DOCX 文件（文本提取，无图片/流程图信息）

```bash
ls "{project_dir}/05-prd/"*.docx 2>/dev/null
```

对每个 DOCX，检查是否存在同名 `.md`（仅替换扩展名）：
- **不存在** → `python3 .claude/skills/ai-pm/scripts/docx_to_md.py "{docx_path}"`
- **已存在** → 跳过

有新转换 MD 时，读取前 200 行提取摘要，追加到 `_memory/L2-prd-versions.md`（格式同上）。

**优先级**：同一文件同时存在 PDF 和 DOCX，以 PDF 为准（视觉信息更完整）。

若两个目录下均无 PDF/DOCX → 静默跳过，继续正常流程。

**注意**：渲染/转换失败不中断主流程，输出 `SKIP:{文件名}:{原因}` 后继续执行。

## 执行方式

六角色并行评审，模拟真实评审会议。此阶段为可选，用户可跳过。

→ 详见 `ai-pm-review` 子技能获取完整评审流程和角色定义。

## 评审报告命名规则

评审报告按当前 PRD 版本命名，避免覆盖历史版本：

1. 读取 `_memory/L2-prd-versions.md` 最后一个版本条目的版本标识（如 `V1`、`V2`）
2. 输出文件命名为 `08-review-{版本标识小写}.md`（如 `08-review-v2.md`）
3. 若无版本索引（`L2-prd-versions.md` 不存在）→ 降级使用 `08-review-report-v1.md`（原有命名，向后兼容）

## CTA 审计（产品经理角色专属）

评审阶段，产品经理角色额外检查以下内容：

1. **CTA 公式检查** — PRD 中所有行动号召是否符合 `[动作动词] + [用户得到什么] + [紧迫/简单]` 公式
2. **异议覆盖检查** — PRD 是否回应了「太贵/没用/没时间/怕失败」四类异议中至少 2 类
3. 参照 `templates/presets/copywriting-frameworks.md` 中 CTA 公式和异议处理模板
