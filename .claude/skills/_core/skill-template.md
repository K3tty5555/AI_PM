# AI_PM 技能文档模板

技能开发请基于此模板编写 SKILL.md。

## 前置声明

```yaml
name: ai-pm-{skill-name}
description: >-
  简短描述技能功能，不超过100字
allowed-tools: Read Write Edit Bash(mkdir) Bash(ls) Bash(cat)
argument-hint: "[参数说明]"
```

## 执行协议

本技能遵循 [AI_PM 公共执行协议](./common-protocol.md)。

## 质量门禁

执行前必须通过以下检查：

- [ ] 检查项1
- [ ] 检查项2

详见 [质量门禁标准](./quality-gates.md)。

## 工作流程

### Phase 1: 准备

```
步骤1: ...
步骤2: ...
```

### Phase 2: 执行

```
步骤1: ...
步骤2: ...
```

### Phase 3: 交付

```
步骤1: ...
步骤2: ...
```

## 输入/输出

### 输入

| 参数 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| input | string | 否 | 输入文件路径 |
| mode | enum | 否 | 执行模式 |

### 输出

| 产出物 | 路径 | 格式 |
|-------|-----|-----|
| 产出物1 | {序号}-{name}.md | Markdown |

## 使用示例

### 示例1: 基本用法

```bash
/ai-pm {skill-name} "需求描述"
```

### 示例2: 指定参数

```bash
/ai-pm {skill-name} --input=file.md --mode=quick
```

## 依赖关系

### 前置依赖

- 技能A: 产出物X
- 技能B: 产出物Y

### 后置触发

- 完成后自动触发: 技能C

## 错误处理

| 错误码 | 说明 | 解决方案 |
|-------|-----|---------|
| E001 | 前置依赖缺失 | 执行前置技能 |
| E002 | 参数错误 | 检查参数格式 |

## 版本历史

| 版本 | 日期 | 变更 |
|-----|------|-----|
| v1.0.0 | 2026-03-01 | 初始版本 |

## 相关技能

- [ai-pm-{related-skill}](../ai-pm-{related-skill}/SKILL.md)
