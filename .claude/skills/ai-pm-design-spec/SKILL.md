---
name: ai-pm-design-spec
description: >-
  设计规范技能。上传公司或团队的 UI 规范，让所有 HTML 输出（原型、仪表盘）自动遵守你们的设计标准，优先级高于 AI 情境定制。
  当用户说「上传设计规范」「加载UI规范」「用公司规范」「Figma规范」「设计Token」
  「统一原型风格」「公司色彩规范」「设计系统」时，立即使用此技能。
argument-hint: "[命令: upload/list/apply/show/reset] [规范名]"
allowed-tools: Read Write Edit Bash(mkdir) Bash(ls)
---

# ai-pm-design-spec - 设计规范

> 上传公司/团队的 UI 规范，优先级高于 AI 情境定制，让原型更贴近真实产品

## 角色说明

- 解决不同公司/团队有自己 UI 规范、原型却用通用风格的问题
- 上传规范后，`ai-pm-prototype` 生成原型时自动应用，无需每次手动指定
- 规范以设计 Token 形式存储，清晰、可版本化管理

## 命令路由

| 命令 | 说明 |
|------|------|
| `upload [规范名]` | 上传并解析设计规范（Figma 导出/PDF/图片/文字描述均可）|
| `list` | 列出所有已保存的设计规范 |
| `apply [规范名]` | 将指定规范设为当前生效规范 |
| `show` | 展示当前生效规范的 Token 摘要 |
| `reset` | 清除当前规范设置，恢复为 AI 情境定制 |

## upload 执行步骤

收到 `upload [规范名]` 指令后：

1. 提示用户提供规范内容（以下任意形式均可）：
   - Figma Token 导出 JSON
   - 设计文档截图或 PDF 描述
   - 文字描述（"主色 #1677ff，圆角 6px，字体 PingFang SC"）
2. 解析内容，提取六类设计 Token（见下方格式）
3. 对无法确定的值提示用户补充，或使用 Apple HIG 默认值填充
4. 保存到 `templates/ui-specs/{规范名}/design-tokens.json`
5. 输出 Token 摘要，询问是否立即激活

## 设计 Token 格式

存储路径：`templates/ui-specs/{规范名}/design-tokens.json`

```json
{
  "name": "规范名",
  "version": "1.0",
  "colors": {
    "primary": "#xxx",
    "background": "#xxx",
    "surface": "#xxx",
    "text": "#xxx",
    "text_secondary": "#xxx"
  },
  "typography": {
    "font_family": "字体族",
    "size_base": "16px",
    "size_sm": "14px",
    "size_lg": "18px"
  },
  "spacing": {
    "page_margin": "24px",
    "section_gap": "32px"
  },
  "radius": "8px",
  "shadow": "0 1px 4px rgba(0,0,0,0.08)"
}
```

## apply 执行步骤

收到 `apply [规范名]` 指令后：

1. 确认 `templates/ui-specs/{规范名}/design-tokens.json` 存在
2. 将规范名写入激活配置 `templates/ui-specs/.active-spec`
3. 输出确认：已激活规范 `{规范名}`，后续原型生成将自动应用

## list 执行步骤

扫描 `templates/ui-specs/` 目录，列出所有含 `design-tokens.json` 的子目录，展示：
- 规范名称
- 版本号
- 当前是否生效（标记 ★）

## show 执行步骤

读取 `templates/ui-specs/.active-spec` 获取当前生效规范名，
加载对应 `design-tokens.json`，以可读格式输出颜色/字体/间距/圆角摘要。

## reset 执行步骤

删除 `templates/ui-specs/.active-spec` 文件，
输出确认：已清除公司规范，后续 HTML 输出将使用 AI 情境定制（frontend-design 根据产品场景自主设计）。

## 与主技能集成

`ai-pm-prototype` 在生成原型时：
1. 检查 `templates/ui-specs/.active-spec` 是否存在
2. 若存在 → 加载对应 Token，替换 CSS 变量（公司规范模式）
3. 若不存在 → 按项目 `.ai-pm-config.json` 的 `designMode` 执行（AI 情境定制 / 主流组件库）

