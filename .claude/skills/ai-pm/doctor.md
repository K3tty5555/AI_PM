# /ai-pm doctor — 技能健康检查

## 命令

`/ai-pm doctor`

## 功能

扫描所有技能文件，检查 22 项一致性指标，输出健康报告。

## 检查项（6 类共 22 项）

### 命令路由一致性（3 项）

1. **命令表 vs 子技能**: 读取 `ai-pm/SKILL.md` 的命令路由表，逐条检查对应的子技能目录和 SKILL.md 是否存在
2. **参数签名**: 检查命令表中描述的参数格式是否与子技能实际接受的参数一致
3. **孤儿命令**: 扫描所有子技能的 SKILL.md，检查是否有定义了命令但主技能未引用的情况

### 交叉引用完整性（4 项）

4. **阶段流程引用**: 检查 `phase-workflows.md`（或 SKILL.md 阶段流程部分）中引用的技能名是否都有对应目录
5. **依赖关系**: 检查 `_core/skill-dependencies.md`（如存在）中的依赖关系是否双向正确
6. **文件索引**: 检查 `_core/file-index.md`（如存在）中的路径是否全部有效（文件确实存在）
7. **状态字段**: 检查 `_status.json` 规范中定义的 phase key 是否覆盖了阶段流程中的所有阶段

### 模板引用（3 项）

8. **模板路径**: 检查技能文件中 hardcode 的模板路径（如 `templates/prd-styles/`）是否存在
9. **飞书模板字段**: 对比 `feishu-template.md` 的字段与 PRD 技能中引用的字段是否一致
10. **风格配置**: 检查 `style-config.json` 结构是否完整（必需字段是否存在）

### 输出规范（3 项）

11. **输出文件名**: 检查各阶段定义的输出文件名是否与阶段流程描述一致
12. **输出路径**: 检查所有输出是否都在 `{projects_dir}/{项目名}/` 下
13. **_status.json 覆盖度**: 检查 _status.json 的 phases 对象是否包含所有阶段的 key

### 版本与元数据（2 项）

14. **frontmatter 完整性**: 检查每个技能的 SKILL.md 是否有标准的 YAML frontmatter（name, description）
15. **manifest 版本**: 如果存在 `skill-manifest.json`，检查 version 字段是否与内容匹配

### 资源与安全（7 项）

16. **技能描述触发条件**: 检查每个技能 SKILL.md 的 description 字段是否包含用户说的话（搜索"当用户说"或类似触发关键词），缺失则警告
17. **技能文件行数**: 扫描 `.claude/skills/` 下所有 SKILL.md，超过 500 行的文件标记为 ⚠️ 警告，建议拆分
18. **模板文件可读性**: 验证 `templates/` 下关键文件（`prd-styles/default/feishu-template.md`、`presets/industry-style-presets.json`、`presets/copywriting-frameworks.md`）是否可访问（文件存在且非空）
19. **样例 PRD 字段一致性**: 读取 `templates/prd-styles/default/sample-*.md`，检查是否包含 feishu-template.md 中定义的核心章节（二、需求分析 / 三、功能清单 / 四、产品流程 / 六、详细功能设计）
20. **硬编码密钥扫描**: 用精确正则 `sk-[a-zA-Z0-9]{20,}` 和 `AKIA[0-9A-Z]{16}` 扫描 `.claude/skills/` 和 `templates/` 目录下的所有文件，排除 `docs/` 和 `MEMORY.md`，匹配到则标记为 ❌ 错误
21. **行业预设完整性**: 读取 `templates/presets/industry-style-presets.json`，检查 JSON 是否包含 7 个行业（general/finance/healthcare/tech/education/ecommerce/enterprise），每个行业必须有 label/accent/bg/font/keywords 字段
22. **SKILL.md 路由表路径存在性**: 从 `ai-pm/SKILL.md` 的命令路由表中提取引用的子技能名（如 `ai-pm-analyze`、`ai-pm-research`），检查 `.claude/skills/{技能名}/SKILL.md` 是否存在

## 执行方式

逐项检查，使用 Read 工具读取相关文件，用文本匹配做比对。

## 输出格式

```markdown
## 技能健康检查报告

扫描时间: {日期时间}
技能总数: {数量}

### ✅ 通过（{N} 项）
  {折叠显示通过的项目}

### ⚠️ 警告（{N} 项）
  {逐条列出，含文件名和行号}

### ❌ 错误（{N} 项）
  {逐条列出，含文件名和行号}

### 建议操作
  {逐条给出具体修复建议}
```

## 注意事项

- 只读取文件，不做任何修改
- 缺失的可选文件（如 _core/ 下的索引文件）标记为 ⚠️ 警告而非 ❌ 错误
- v0.3.0 仅 CLI 侧，客户端展示后续迭代
