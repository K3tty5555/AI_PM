# 新智学设计系统 (Xin Zhixue Design System)

> 面向 K12 在线教育平台的现代化设计系统

## 概述

**新智学** 是一套专为 K12 在线教育场景打造的完整设计系统，基于智学网原有设计规范进行提炼、优化和标准化。本设计系统涵盖了颜色、字体、间距、组件等全方位的设计令牌，旨在为教育类产品提供一致、专业、易用的视觉体验。

## 设计理念

### 1. 清晰与专注
- 简洁的界面设计，减少视觉干扰
- 清晰的信息层级，帮助学生专注于学习内容
- 合理的留白，提升阅读舒适度

### 2. 活力与亲和
- 以青色 (#05C1AE) 为主色调，传递青春活力
- 圆润的组件边角 (4px-8px)，营造友好氛围
- 适度的动效，增强交互反馈

### 3. 专业与可靠
- 严谨的组件设计，确保功能完备
- 一致的视觉语言，建立品牌认知
- 完善的状态定义，覆盖各种使用场景

## 设计令牌 (Design Tokens)

### 颜色系统

#### 主色调
| Token | 色值 | 用途 |
|-------|------|------|
| `primary.main` | #05C1AE | 主按钮、链接、强调元素 |
| `primary.light` | #2ACDB8 | 悬停状态、渐变 |
| `primary.dark` | #03A499 | 激活状态 |
| `primary.bg` | #E6FCF8 | 背景高亮、选中状态 |

#### 辅助色
| Token | 色值 | 用途 |
|-------|------|------|
| `secondary.purple` | #8358F6 | 特殊强调、标签 |
| `secondary.blue` | #33A3EE | 信息提示、链接 |

#### 语义色
| 类型 | 主色 | 背景色 | 用途 |
|------|------|--------|------|
| 成功 | #05C86E | #E8FFF0 | 成功提示、完成状态 |
| 警告 | #F9A529 | #FFFAE8 | 警告提示、注意事项 |
| 错误 | #F45454 | #FFECE8 | 错误提示、删除操作 |
| 信息 | #33A3EE | #E8FAFF | 信息提示、提示框 |

#### 中性色阶
从白到黑的完整色阶，用于文本、边框、背景等：

| Token | 色值 | 用途 |
|-------|------|------|
| `neutral.white` | #FFFFFF | 纯白背景 |
| `neutral.gray200` | #F0F3F7 | 页面背景、表头 |
| `neutral.gray400` | #DCDFE3 | 分割线、边框 |
| `neutral.gray500` | #D2D5D9 | 输入框边框 |
| `neutral.gray600` | #B9BCBF | 禁用文字、占位符 |
| `neutral.gray700` | #888A8C | 次要文字 |
| `neutral.gray800` | #414243 | 常规文字 |
| `neutral.gray900` | #242526 | 主要文字、标题 |

### 字体系统

#### 字体族
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
```

#### 字号规范
| 级别 | 字号 | 行高 | 用途 |
|------|------|------|------|
| xs | 12px | 1.5 | 辅助文字、标签 |
| sm | 13px | 1.5 | 紧凑内容 |
| base | 14px | 1.5 | 正文内容 |
| lg | 16px | 1.5 | 强调文字 |
| xl | 18px | 1.4 | 小标题 |
| 2xl | 20px | 1.3 | 模块标题 |
| 3xl | 24px | 1.3 | 页面标题 |
| 4xl | 32px | 1.2 | 大标题 |

#### 字重规范
| 级别 | 数值 | 用途 |
|------|------|------|
| normal | 400 | 正文 |
| medium | 500 | 按钮、标签 |
| semibold | 600 | 标题、强调 |
| bold | 700 | 大标题 |

### 间距系统

| Token | 数值 | 用途 |
|-------|------|------|
| xs | 4px | 图标间距 |
| sm | 8px | 紧凑间距 |
| md | 12px | 常规间距 |
| lg | 16px | 卡片内边距 |
| xl | 20px | 模块间距 |
| 2xl | 24px | 区块间距 |
| 3xl | 32px | 大区块间距 |

### 圆角系统

| Token | 数值 | 用途 |
|-------|------|------|
| none | 0px | 锐利边角 |
| sm | 2px | 轻微圆角 |
| base | 4px | 按钮、输入框 |
| lg | 8px | 卡片、弹窗 |
| xl | 10px | 大卡片 |
| 2xl | 12px | 特殊组件 |
| 3xl | 16px | 大容器 |
| full | 9999px | 胶囊、圆形 |

### 阴影系统

| Token | 阴影值 | 用途 |
|-------|--------|------|
| sm | 0 1px 2px rgba(0,0,0,0.05) | 轻微浮起 |
| base | 0 1px 3px rgba(0,0,0,0.1) | 卡片、面板 |
| md | 0 4px 6px rgba(0,0,0,0.07) | 下拉菜单 |
| lg | 0 10px 15px rgba(0,0,0,0.08) | 弹窗、模态框 |
| xl | 0 20px 25px rgba(0,0,0,0.1) | 悬浮面板 |
| focus | 0 0 0 3px rgba(5,193,174,0.2) | 焦点状态 |

## 组件规范

### Button 按钮

#### 尺寸规格
- **Small**: 28px 高，13px 字号
- **Medium**: 32px 高，14px 字号（默认）
- **Large**: 40px 高，16px 字号

#### 类型样式

**主按钮 (Primary)**
- 背景: #05C1AE
- 文字: 白色
- 悬停: #03A499
- 圆角: 4px

**次要按钮 (Secondary)**
- 背景: 白色
- 边框: 1px solid #D2D5D9
- 文字: #242526
- 悬停: 背景 #F5F5F5

**文字按钮 (Text)**
- 背景: 透明
- 文字: #05C1AE
- 悬停: 背景 #E6FCF8

**危险按钮 (Danger)**
- 背景: #F45454
- 文字: 白色
- 用于删除等危险操作

### Input 输入框

#### 尺寸规格
- **Small**: 28px 高
- **Medium**: 32px 高（默认）
- **Large**: 40px 高

#### 样式规范
- 边框: 1px solid #D2D5D9
- 圆角: 4px
- 背景: 白色
- 聚焦: 边框 #05C1AE + 阴影
- 占位符: #B9BCBF
- 禁用: 背景 #F5F5F5

### Table 表格

#### 表头
- 背景: #F0F3F7
- 文字: #242526
- 字号: 14px
- 字重: 500
- 底部边框: 1px solid #DCDFE3

#### 单元格
- 内边距: 12px 16px
- 底部边框: 1px solid #E9ECF0
- 行悬停: 背景 #F5F5F5
- 行选中: 背景 #E6FCF8

### Card 卡片
- 背景: 白色
- 圆角: 8px
- 阴影: 0 1px 3px rgba(0,0,0,0.1)
- 内边距: 16px

### Modal 弹窗

#### 遮罩层
- 背景: rgba(0,0,0,0.5)

#### 内容区
- 背景: 白色
- 圆角: 8px
- 阴影: 0 20px 25px rgba(0,0,0,0.1)

#### 头部
- 底部边框: 1px solid #E9ECF0
- 字号: 18px
- 字重: 500

### Menu 菜单
- 背景: 白色
- 圆角: 4px
- 阴影: 0 4px 6px rgba(0,0,0,0.07)
- 项内边距: 8px 12px
- 项悬停: 背景 #F0F3F7
- 项激活: 背景 #E6FCF8 + 文字 #05C1AE

### Checkbox / Radio

#### 尺寸
- **Small**: 14px
- **Medium**: 16px（默认）
- **Large**: 18px

#### 颜色
- 选中: #05C1AE
- 未选中: #D2D5D9
- 禁用: #B9BCBF

### Switch 开关

#### 尺寸
- **Small**: 28x16px
- **Medium**: 36x20px（默认）
- **Large**: 48x24px

#### 颜色
- 开启: #05C1AE
- 关闭: #D2D5D9

### Tag 标签

#### 类型
- **Default**: 背景 #F0F3F7
- **Primary**: 背景 #E6FCF8 + 文字 #05C1AE
- **Success**: 背景 #E8FFF0 + 文字 #05C86E
- **Warning**: 背景 #FFFAE8 + 文字 #F9A529
- **Error**: 背景 #FFECE8 + 文字 #F45454

### Badge 徽标

#### 尺寸
- **Small**: 16px 高
- **Medium**: 20px 高（默认）
- **Large**: 24px 高

#### 颜色
- 默认: #F45454（红色）
- 主要: #05C1AE
- 成功: #05C86E

### Link 链接
- 默认: #05C1AE
- 悬停: #03A499
- 激活: #05B2A1
- 已访问: #8358F6
- 禁用: #B9BCBF

## 响应式断点

| 断点 | 宽度 | 设备类型 |
|------|------|----------|
| xs | 0px | 超小屏手机 |
| sm | 600px | 手机横屏 |
| md | 834px | 平板竖屏 |
| lg | 1024px | 平板横屏/小笔记本 |
| xl | 1440px | 桌面显示器 |
| 2xl | 1920px | 大屏显示器 |

## 动画规范

### 时长
| 类型 | 时长 | 用途 |
|------|------|------|
| fast | 150ms | 微交互、hover |
| normal | 200ms | 常规过渡 |
| slow | 300ms | 复杂动画 |

### 缓动函数
| 名称 | 值 | 用途 |
|------|-----|------|
| easeInOut | cubic-bezier(0.4, 0, 0.2, 1) | 默认 |
| easeOut | cubic-bezier(0, 0, 0.2, 1) | 退出动画 |
| easeIn | cubic-bezier(0.4, 0, 1, 1) | 进入动画 |
| sharp | cubic-bezier(0.4, 0, 0.6, 1) | 快速切换 |

## 使用示例

### CSS 变量方式

```css
:root {
  --xz-primary-main: #05C1AE;
  --xz-primary-light: #2ACDB8;
  --xz-primary-dark: #03A499;
  --xz-primary-bg: #E6FCF8;

  --xz-text-primary: #242526;
  --xz-text-secondary: #414243;
  --xz-text-tertiary: #888A8C;
  --xz-text-disabled: #B9BCBF;

  --xz-border-color: #D2D5D9;
  --xz-border-color-light: #DCDFE3;

  --xz-bg-page: #F0F3F7;
  --xz-bg-container: #FFFFFF;
}
```

### JavaScript 方式

```javascript
import tokens from './design-tokens.json';

// 使用颜色
const primaryColor = tokens.colors.primary.main;
const successBg = tokens.colors.semantic.successBg;

// 使用组件样式
const buttonStyle = {
  background: tokens.components.button.variants.primary.background,
  color: tokens.components.button.variants.primary.color,
  borderRadius: tokens.components.button.sizes.medium.borderRadius,
  padding: tokens.components.button.sizes.medium.padding,
};
```

## 文件结构

```
templates/ui-specs/新智学/
├── README.md              # 设计系统文档
├── design-tokens.json     # 设计令牌（结构化数据）
└── examples/              # 示例文件（可选）
    ├── button-examples.html
    ├── form-examples.html
    └── card-examples.html
```

## 更新日志

### v1.0.0 (2026-03-02)
- 初始版本发布
- 提取智学网核心设计规范
- 建立完整的设计令牌体系
- 定义 15+ 基础组件规范
- 建立颜色、字体、间距系统

## 贡献指南

如需更新设计系统：
1. 在 `design-tokens.json` 中修改对应令牌
2. 更新 `README.md` 文档
3. 记录变更到更新日志
4. 更新版本号

## 关联项目

本设计系统应用于以下 AI_PM 项目：
- 智学网产品分析
- K12 教育类产品设计
- 考试/作业模块设计

---

**新智学设计系统** © 2026 AI_PM Project
