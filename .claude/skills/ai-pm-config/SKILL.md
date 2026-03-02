---
name: ai-pm-config
description: >-
  AI_PM 统一配置管理中心。管理写作风格、UI规范、项目配置。
  整合原 ai-pm-writing-style 和 ai-pm-ui-spec 功能。
argument-hint: "[style|ui|project] [action] [参数]"
allowed-tools: Read Write Edit Bash(mkdir) Bash(ls) Bash(cp) Bash(rm)
---

# ai-pm-config - 统一配置管理

> 一站式配置管理中心：写作风格、UI规范、项目设置

## 快速开始

```bash
/ai-pm config                  # 显示所有配置概览
/ai-pm config style list       # 列出写作风格
/ai-pm config ui list          # 列出UI规范
/ai-pm config project init     # 初始化项目配置
```

## 配置分类

### 1. style - 写作风格管理

**来源**: 原 `ai-pm-writing-style`

**功能**: 分析PRD文档，提取写作风格特征，保持文档一致性。

```bash
# 列出所有风格
/ai-pm config style list

# 分析PRD创建风格
/ai-pm config style analyze ~/path/to/prd.md

# 设置默认风格
/ai-pm config style set-default default

# 删除风格
/ai-pm config style remove my-style
```

**存储位置**: `templates/prd-styles/{风格名}/`

### 2. ui - UI规范管理

**来源**: 原 `ai-pm-ui-spec`

**功能**: 管理UI设计规范，支持设计令牌提取和应用。

```bash
# 列出所有UI规范
/ai-pm config ui list

# 从图片/PDF提取设计规范
/ai-pm config ui extract my-company ./design.pdf

# 手动创建UI规范
/ai-pm config ui create my-company

# 设置项目级UI规范
/ai-pm config ui set-project my-company
```

**存储位置**:
- 全局: `templates/ui-specs/{规范名}/`
- 项目: `output/projects/{项目}/07-references/ui-spec/`

### 3. project - 项目配置

**新增功能**

**功能**: 管理项目默认设置，避免每次重复选择。

```bash
# 初始化项目配置
/ai-pm config project init

# 设置默认模式
/ai-pm config project set mode quick

# 设置默认风格
/ai-pm config project set style default

# 设置默认UI规范
/ai-pm config project set ui my-company

# 查看当前配置
/ai-pm config project show
```

**配置文件**: `.ai-pm-config.json`

```json
{
  "version": "1.0",
  "defaults": {
    "mode": "standard",
    "style": "default",
    "ui_spec": "enterprise-sample",
    "auto_review": false
  },
  "preferences": {
    "language": "zh-CN",
    "output_format": "markdown",
    "prototype_framework": "html"
  }
}
```

## 配置优先级

当执行技能时，配置按以下优先级生效：

```
1. 命令行参数（最高）
   例: /ai-pm --style=enterprise-standard

2. 项目配置
   例: output/projects/{项目}/.ai-pm-config.json

3. 全局配置
   例: ~/.ai-pm/config.json

4. 系统默认（最低）
   例: templates/prd-styles/default/
```

## 迁移指南

### 从旧命令迁移

| 旧命令 | 新命令 | 状态 |
|--------|--------|------|
| `/ai-pm writing-style analyze` | `/ai-pm config style analyze` | ✅ 兼容 |
| `/ai-pm writing-style list` | `/ai-pm config style list` | ✅ 兼容 |
| `/ai-pm ui-spec upload` | `/ai-pm config ui extract` | ✅ 兼容 |
| `/ai-pm ui-spec list` | `/ai-pm config ui list` | ✅ 兼容 |

### 过渡期说明

- **2026-03-01 ~ 2026-03-15**: 新旧命令同时可用
- **2026-03-15 后**: 旧命令输出重定向提示

## 配置同步

### 导出配置

```bash
/ai-pm config export > ai-pm-config-backup.json
```

### 导入配置

```bash
/ai-pm config import ai-pm-config-backup.json
```

## 与主技能集成

当执行 `/ai-pm` 主技能时：

1. 自动读取项目配置 `.ai-pm-config.json`
2. 应用默认设置（模式、风格、UI规范）
3. 如无配置，提示用户创建

## 质量门禁

- [ ] 配置文件格式正确（JSON Schema验证）
- [ ] 引用的风格和UI规范存在
- [ ] 配置值在允许范围内

详见 [_core/quality-gates.md](../_core/quality-gates.md)

## 执行协议

本技能遵循 [AI_PM 公共执行协议](../_core/common-protocol.md)。

## 版本历史

| 版本 | 日期 | 变更 |
|-----|------|-----|
| v1.0.0 | 2026-03-01 | 初始版本，合并 writing-style + ui-spec + 新增 project 配置 |

## 相关技能

- [ai-pm](../ai-pm/SKILL.md) - 主技能，使用本配置
- [ai-pm-prd](../ai-pm-prd/SKILL.md) - 读取 style 配置
- [ai-pm-prototype](../ai-pm-prototype/SKILL.md) - 读取 ui 配置
