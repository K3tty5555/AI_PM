# 智学网 B 端预设

> 此文件用于 `/ai-pm new {项目名} --preset=智学网B端` 命令。
> 内容会被**复制**进新项目的 `_memory/L0-identity.md`，之后随项目独立演化，修改此文件不影响已有项目。

## 技术栈
Vue 3 + TypeScript + Vite + ElementPlus

## 设计 Token
主色：#05C1AE
错误色：#F45454
警告色：#F6B54E
成功色：#33A3EE
字体：系统默认（-apple-system / 微软雅黑）

## 目标用户
高中教师（数学/英语为主），B 端 SaaS，学校/区县采购。
教师角色包含：授课教师、学情管理员、考试管理员、单校管理员。

## 业务域
智学网，覆盖考试、作业、学情分析三条线。
主要产品线：精准教学（web-precision-agent）、题目设计（web-pt-dj-front）、
容器化工具（zx-container-web）、设计工作台（designer-workbench）。

## 产品原则
- 不做 C 端
- 数据安全红线：成绩发布控制 + 指标发布控制两层
- 权限快照机制：报告查看时实时读当前权限，非发布时固化
- 仅单校管理员/考试管理员可创建考试，教师不参与

## 代码仓路径（供设计指纹提取）
精准教学：<YOUR_CODEBASE_ROOT>/web-precision-agent
题目设计：<YOUR_CODEBASE_ROOT>/web-pt-dj-front
容器化：<YOUR_CODEBASE_ROOT>/zx-container-web
设计工作台：<YOUR_CODEBASE_ROOT>/designer-workbench
