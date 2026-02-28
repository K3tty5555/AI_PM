# AI_PM 模板库

> 存放各类配置模板和设计资源，供 AI_PM 技能使用

---

## 📁 文件夹结构

```
templates/
│
├── README.md                      # 📄 本说明文件
│
├── 00-examples/                   # 📝 示例文件
│   └── example-requirement.md     #    需求示例（供参考）
│
├── 01-config/                     # ⚙️ 配置模板
│   └── reference-config.md        #    参考资源配置模板
│
├── ui-specs/                      # 🎨 UI 规范库（设计规范）
│   ├── README.md                  #    使用说明
│   ├── example-enterprise/        #    企业规范示例
│   └── [用户自定义规范]/           #    你的 UI 规范
│
├── writing-styles/                # ✍️ 写作风格库（PRD 风格）
│   ├── README.md                  #    使用说明
│   ├── default/                   #    系统默认风格
│   └── [用户自定义风格]/           #    你的写作风格配置
│
└── prd-templates/                 # 📝 PRD 模板
    └── (上传你的 PRD 模板)
```

---

## 🚀 快速开始

### 1. 参考资源配置（现有系统迭代）

复制模板到项目：
```bash
cp templates/01-config/reference-config.md \
   output/projects/你的项目/07-references/
```

### 2. UI 规范（多项目共享）

创建你的 UI 规范：
```bash
mkdir templates/ui-specs/my-company
cp templates/ui-specs/example-enterprise/* \
   templates/ui-specs/my-company/
```

### 3. PRD 写作风格

分析你的 PRD 创建写作风格：
```bash
# 分析你的 PRD 文件，自动提取写作风格
/ai-pm writing-style analyze ~/path/to/your-prd.md

# 查看所有可用写作风格
/ai-pm writing-style list
```

### 4. 自定义 PRD 模板

上传你的模板：
```bash
# 放入 prd-templates/ 文件夹
# 建议使用 -template.md 后缀
```

---

## 📌 各文件夹说明

| 文件夹 | 用途 | 使用频率 |
|--------|------|---------|
| `00-examples/` | 示例文件，供参考学习 | 偶尔查看 |
| `01-config/` | 配置模板，如参考资源配置 | 按需复制 |
| `ui-specs/` | UI 规范（颜色、字体、组件），跨项目共享 | 常用 |
| `writing-styles/` | PRD 写作风格库（章节结构、用词习惯） | 常用 |
| `prd-templates/` | PRD 文档模板 | 按需上传 |

---

## 💡 使用建议

1. **UI 规范** → 放入 `ui-specs/`，所有项目共享
2. **写作风格** → 通过 `/ai-pm writing-style analyze` 创建，保存到 `writing-styles/`
3. **项目专属配置** → 复制 `01-config/` 的模板到项目 `07-references/`
4. **文档模板** → 上传到对应 `xxx-templates/` 文件夹

## 📊 写作风格 vs UI 规范

| 对比项 | 写作风格 (`writing-styles/`) | UI 规范 (`ui-specs/`) |
|--------|----------------------------|------------------------------|
| **关注点** | PRD 写作风格、章节结构、用词习惯 | UI 视觉风格、组件、颜色、字体 |
| **影响内容** | 文字描述、章节结构、表格格式 | 原型视觉、颜色、字体、间距 |
| **使用时机** | 生成 PRD 文档时 | 生成原型时 |
| **创建方式** | 分析用户 PRD 自动生成 | 上传设计资源解析生成 |

---

📁 **上传你的模板文件到对应目录即可自动生效**
