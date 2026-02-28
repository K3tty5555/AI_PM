# 全局设计规范管理

> 存放跨项目通用的设计规范，所有项目共享使用
> 适合有多个项目需要统一设计体系的团队/个人

---

## 📁 文件夹结构

```
ai-pm/templates/design-systems/
├── README.md                       # 本说明文件
├── enterprise-standard/            # 示例：企业级设计规范
│   ├── README.md                   # 规范说明
│   ├── design-guidelines.md        # 设计规范文档
│   ├── brand-assets/               # 品牌资产
│   ├── ui-components/              # UI组件截图
│   └── page-designs/               # 页面设计稿
├── apple-style/                    # 示例：Apple风格规范
│   ├── README.md
│   ├── design-guidelines.md
│   └── ...
├── material-design/                # 示例：Material Design规范
│   ├── README.md
│   └── ...
└── [你的自定义规范]/               # 用户自定义规范
    ├── README.md
    └── ...
```

---

## 🎯 使用场景

| 场景 | 解决方案 |
|------|---------|
| 企业内部多个产品统一风格 | 创建 `enterprise-standard/` 规范 |
| 个人项目常用 Apple 风格 | 创建 `my-apple-style/` 规范 |
| 不同客户不同风格 | 为每个客户创建独立规范文件夹 |
| 项目特殊风格 | 在项目的 `08-design-system/` 覆盖 |

---

## 📝 创建设计规范

### 步骤1：创建规范文件夹

```bash
# 在 ai-pm/templates/design-systems/ 下创建
mkdir my-company-design
```

### 步骤2：创建规范说明文件

创建 `my-company-design/README.md`：

```markdown
# XX企业设计规范

## 规范简介
- 适用项目：企业内部所有产品
- 设计风格：科技、专业、简洁
- 创建时间：2026-02-28

## 核心特点
- 主色：企业蓝 #0066FF
- 字体：思源黑体
- 圆角：8px（按钮）、16px（卡片）

## 使用说明
- 适用于所有B端产品
- 深色模式待完善
```

### 步骤3：上传设计资源

```
my-company-design/
├── README.md                    # 规范说明
├── design-guidelines.md         # 详细设计规范（复制模板修改）
├── brand-assets/
│   ├── logo.png
│   └── color-palette.png
├── ui-components/
│   ├── buttons.png              # 按钮各种状态
│   ├── forms.png                # 表单元素
│   ├── cards.png                # 卡片样式
│   └── tables.png               # 表格样式
└── page-designs/
    ├── dashboard.png            # 仪表盘参考
    └── list-page.png            # 列表页参考
```

---

## 🔍 AI 读取优先级

当生成原型时，AI 按以下优先级读取设计规范：

```
1. 项目级设计规范（最高优先级）
   → projects/项目名/08-design-system/

2. 全局设计规范（次优先级）
   → templates/design-systems/[具体规范]/

3. 默认规范（无自定义规范时使用）
   → Apple 风格默认规范
```

### 规范选择逻辑

**情况1：项目有设计规范**
```
✅ 检测到项目级设计规范
   → 直接使用项目规范
```

**情况2：项目无规范，全局有1个规范**
```
✅ 检测到全局设计规范：enterprise-standard
   → 询问"是否使用 enterprise-standard 规范？"
   → 用户确认后使用
```

**情况3：项目无规范，全局有多个规范**
```
📁 检测到多个全局设计规范：
   1. enterprise-standard（企业标准）
   2. apple-style（Apple风格）
   3. material-design（Material风格）

💬 请选择使用哪个规范？
   • 回复数字 1/2/3
   • 或回复"不使用规范"采用默认风格
```

**情况4：无自定义规范**
```
ℹ️ 未检测到自定义设计规范
   → 使用默认 Apple 风格
```

---

## 💡 最佳实践

### 1. 命名规范
- 使用英文/拼音命名文件夹
- 简短描述性名称：`company-standard`、`finance-product`、`apple-clean`

### 2. 版本管理
- 重大更新创建新规范文件夹：`company-standard-v2`
- 或在 README 中记录版本历史

### 3. 规范模板
复制 `design-guidelines-template.md` 作为起点，根据你的需求修改。

### 4. 截图质量
- 使用高清截图（推荐 2x 分辨率）
- 标注关键尺寸和颜色值
- 包含组件的各种状态（正常、悬浮、点击、禁用）

---

## 📎 示例规范

以下示例规范已为你创建：

| 规范名称 | 说明 | 适用场景 |
|---------|------|---------|
| `example-enterprise/` | 企业级B端产品规范示例 | 内部管理系统 |
| `example-apple/` | Apple风格规范示例 | 消费级产品 |

---

**现在开始创建你的全局设计规范吧！**
