# 产品知识库

跨项目经验沉淀中心。

> ⚠️ **本机功能，内容不入库**：本目录下各类卡片（PITFALL/PATTERN/PLAYBOOK 等）按仓库 `.gitignore` 规则**不纳入版本库**，是每台机器本地沉淀的产物。clone 本仓只会得到空的目录结构（`.gitkeep`）。技能文件里引用的卡片编号（如「见 PITFALL-045」）是**本机线索**——其要点已在引用处内联说明，不依赖打开卡片也能理解。

## 目录说明

| 目录 | 内容 |
|------|------|
| patterns/ | 可复用设计模式（用户引导、权限设计等） |
| decisions/ | 关键决策记录（ADR 格式） |
| pitfalls/ | 踩坑记录，避免重复犯错 |
| metrics/ | 常用度量指标模板 |
| playbooks/ | 场景化操作手册 |
| insights/ | 用户行为洞察报告 |

## 知识卡片格式

见 `/ai-pm knowledge add` 命令，按引导填写。

## 命令

- `/ai-pm knowledge add` - 添加新知识
- `/ai-pm knowledge search {关键词}` - 搜索知识库
- `/ai-pm knowledge list` - 列出所有分类
- `/ai-pm knowledge sync` - 从当前项目提取知识
- `/ai-pm knowledge suggest` - 推荐相关知识（内部调用）
