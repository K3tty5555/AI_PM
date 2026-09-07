# UI 规范库

本目录保留可随 AI_PM 分发的通用设计规范示例，以及旧式 design-tokens.json 规范库的兼容入口。它不等同于当前项目正在使用的产品规范。

## 当前内容

| 路径 | 内容 | 用途 |
|---|---|---|
| enterprise-sample/ | 规范说明示例，无 Token 文件 | 展示企业级规范如何组织 |
| K12教育示例/ | 说明与 design-tokens.json | 通用教育场景示例，不代表某个真实产品的现网规范 |
| .active-spec（可选） | 激活项名称 | 旧式全局 Token 库入口；文件不存在时没有全局激活项 |

## 与产品设计规范、工作台规范的关系

- 本目录：通用示例、Token 格式和兼容入口，供其他使用 AI_PM 的人复用。
- 本机 output/assets/ 下的产品设计资产：真实产品 DESIGN.md、配套 Token、参考材料与证据；由项目的 designSpecPath 指向。
- templates/prototype-collab/DESIGN.md：布局确认、逐页确认与标签工具的通用操作界面，不规定业务原型视觉。

按项目隐私规则，真实公司/产品名称、公司品牌 Token、内部截图等不进入公开模板。私有产品规范应放本机产品资产区；不要为了兼容旧目录结构复制一份私有规范到这里，形成两个维护源。

## 取用顺序

1. 用户本轮明确指令和已确认的目标改动。
2. 项目 .ai-pm-config.json 中 designSpecPath 指向的产品 DESIGN.md（路径相对项目目录），再结合当前设备/模块的真实页面证据。
3. 项目未配置指针时，兼容读取本目录 .active-spec 选中的 design-tokens.json。
4. 仍无规范时，沿用项目 designMode 或用户选择，使用 AI 情境定制；没有“默认 Apple 风格”的约定。

目录里存在某个示例不等于已启用它。全局激活项不覆盖已有项目指针；同一产品的 Web 规范也不能直接覆盖其 App 页面布局。

## 兼容命令

由 ai-pm-design-spec skill 解释执行：

- upload：整理规范。通用示例可落本目录；私有产品规范落产品资产区。
- list：列出本目录中具有 design-tokens.json 的规范。
- apply：将本目录某个有效 Token 规范写为 .active-spec。
- show：查看旧式全局激活项的 Token。
- reset：清除旧式全局激活项，不清除项目 designSpecPath。

这些是 skill 工作流，不是会自动扫描所有项目、识别品牌并切换规范的独立服务。完整路由见 .claude/skills/ai-pm-design-spec/SKILL.md。
