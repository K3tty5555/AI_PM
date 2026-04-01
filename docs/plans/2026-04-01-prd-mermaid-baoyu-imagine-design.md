# PRD Mermaid 渲染迁移至 baoyu-imagine 设计文档

## 目标

将 ai-pm-prd skill 的 Mermaid 流程图渲染路径从「直调 Seedream Python / 本地 Chrome」统一迁移至用户级 baoyu-imagine skill，DOCX 和 PDF 导出路径均生效。

## 背景与问题

当前 Mermaid 渲染存在三条独立路径，互相矛盾：

1. `md2docx.py` AI 模式：直调 Seedream Python，需 TTY 交互，Claude Code 非 TTY 自动回退本地 Chrome
2. `preprocess_mermaid.py`：PDF 路径专用，本地 Chrome headless 渲染，硬编码依赖
3. `illustration.md`：`/ai-pm illustration` 独立命令，同样直调 Seedream，不走 baoyu-imagine

用户期望：统一走 baoyu-imagine skill，尊重用户的 EXTEND.md 配置（provider/model/quality），Claude Code 环境下不再回退本地渲染。

## 设计方案

### 核心流程（DOCX + PDF 统一）

```
ai_illustration_mode = true
    ↓
步骤6（SKILL.md）
    ├── 扫描 PRD，提取所有 Mermaid 块
    ├── 为每块构建 prompt 文件
    ├── 写 /tmp/{slug}-mermaid-batch.json
    ├── 调用 ~/.bun/bin/bun baoyu-imagine --batchfile
    ├── 图片存入 11-illustrations/{编号}-{slug}.png
    └── 生成临时导出副本 _export_tmp.md
         （Mermaid 块 → ![描述](../11-illustrations/xxx.png)）
         （原始 PRD 保持不动）

DOCX → md2docx.py 用副本（原生支持 ![](path)）
PDF  → build-pdf-html.js 用副本（新增 ![](path) → base64 img）
完成后删除副本和 /tmp/ 临时文件
```

### 关键原则

- **原始 PRD 不修改**：Mermaid 代码块保留，作为 source of truth
- **临时副本用完即删**：`_export_tmp.md` 只在导出过程中存在
- **baoyu-imagine 主导**：provider/model/quality 全部读用户 EXTEND.md，不硬编码
- **bun 路径**：优先 `~/.bun/bin/bun`，回退 `npx -y bun`

## 改动清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `.claude/skills/ai-pm-prd/SKILL.md` | 修改 | ① 步骤4.5a 删除「非交互模式走本地渲染」冲突句；② 步骤6 实现替换为 baoyu-imagine batch 调用；③ PDF 导出段删除 preprocess_mermaid.py 调用 |
| `.claude/skills/ai-pm-prd/build-pdf-html.js` | 修改 | Markdown→HTML 转换时新增 `![alt](path)` → `<figure><img base64><figcaption></figure>` 支持，路径相对 PRD 文件目录解析 |
| `.claude/skills/ai-pm-prd/preprocess_mermaid.py` | 删除 | 功能被新流程完全替代 |
| `.claude/skills/ai-pm/illustration.md` | 修改 | 实现层替换为调用 baoyu-imagine（保留风格选择交互逻辑，移除直调 Seedream 代码） |
| `.claude/skills/ai-pm-prd/md2docx.py` | 不动 | 保留 TTY 手动运行兼容性 |

## 不在本次范围内

- `md2docx.py` 内部的 Seedream/Chrome 代码清理（可后续单独做）
- baoyu-imagine EXTEND.md 配置本身
- 其他 skill 的 Mermaid 处理

## 验证标准

1. Claude Code 里执行 `/ai-pm prd`，开启 AI 配图模式，DOCX 中的流程图为 AI 生成的高清图片
2. PDF 导出同样包含 AI 图片，非本地 Chrome 截图
3. 原始 PRD `.md` 文件的 Mermaid 代码块保持完整
4. `/ai-pm illustration` 命令仍可用，图片质量与直接用 baoyu-imagine 一致
5. `preprocess_mermaid.py` 不再被任何地方引用
