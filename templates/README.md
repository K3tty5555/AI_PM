# AI_PM 模板库

> 存放各类配置模板和设计资源，供 AI_PM 技能使用

---

## 📁 文件夹结构

```
templates/
│
├── README.md                      # 📄 本说明文件
│
├── configs/                       # ⚙️ 配置模板
│   └── autonomy-levels.md         #    自主性等级（L1–L5）定义，Agent PRD 用
│
├── prd-styles/                    # ✍️ PRD 写作风格库
│   ├── README.md                  #    使用说明
│   ├── default/                   #    默认风格（feishu/pdf 模板 + 决策评审模板 + 3 份 sample + agent 补充）
│   └── enterprise-standard/       #    企业标准风格
│
├── presets/                       # 🎛️ 行业 / 文案 / 导出预设
│   ├── industry-style-presets.json    # 行业风格预设
│   ├── copywriting-frameworks.md      # 文案框架
│   ├── docx-recipes.json              # DOCX 导出配方
│   ├── pdf-covers.json                # PDF 封面预设
│   └── K12教育B端示例.md              # 行业示例（通用占位）
│
├── ui-specs/                      # 🎨 UI 设计规范库
│   ├── README.md                  #    使用说明
│   ├── enterprise-sample/         #    企业规范示例
│   └── [用户自定义规范]/           #    你的 UI 规范（自建）
│
├── visual-anchor/                 # 🖼️ 原型视觉锚点包协议模板（Claude ↔ Codex 生图交接）
│   ├── README.md                  #    协议说明
│   ├── request.template.json      #    Claude 写出 / 交接输入
│   ├── manifest.template.json     #    Codex 视觉稿生成回写
│   ├── visual-fingerprint.template.md # 视觉指纹模板
│   └── audit.template.md          #    视觉审计模板
│
├── project-index/                 # 🗂️ 项目级 README 索引模板（3 层）
│   ├── README.md                  #    使用说明
│   ├── root-readme.template.md     #    项目根 README
│   ├── prd-readme.template.md       #    PRD 目录 README
│   └── references-readme.template.md # 参考资料目录 README
│
└── knowledge-base/                # 📚 知识库（本机沉淀）
    ├── README.md                  #    说明
    └── {decisions,insights,metrics,    # 6 类卡片目录
          patterns,pitfalls,playbooks}/ #    ⚠️ 内容卡片本机生成、不入库（见 .gitignore），仓库仅保留目录结构
```

> ⚠️ **知识库说明**：`knowledge-base/` 下各类目录的**内容卡片（PITFALL/PATTERN/PLAYBOOK 等）按 `.gitignore` 规则不纳入版本库**，是本机沉淀产物。clone 本仓得到的是空目录结构；技能文件里引用的卡片编号（如 `见 PITFALL-045`）指向本机卡片。

---

## 🚀 快速开始

### 1. PRD 写作风格

```bash
# 分析你的历史 PRD，自动提取写作风格（保存到 prd-styles/）
/ai-pm persona

# 默认风格库已含：feishu/pdf 导出模板、决策评审型模板、3 份行业 sample
```

### 2. UI 规范（多项目共享）

```bash
mkdir templates/ui-specs/my-company
cp templates/ui-specs/enterprise-sample/* templates/ui-specs/my-company/
# 之后 /ai-pm design-spec 加载
```

### 3. 原型视觉锚点包（高保真 / 现网改版时）

```bash
# 协议模板见 visual-anchor/；状态检查：
node scripts/ai-sync/check-visual-anchor-package.js output/projects/{项目名}
```

### 4. Agent Team 多代理协作（复杂项目）

```bash
/ai-pm --team "你的复杂需求"
# CLI 状态查看（公开仓缺本地模板时 CLI 用内置最小模板兜底）：
.claude/skills/agent-team/agent-team-cli.sh status
```

---

## 📌 各文件夹说明

| 文件夹 | 用途 | 使用频率 |
|--------|------|---------|
| `configs/` | 自主性等级等配置定义 | 写 Agent PRD 时 |
| `prd-styles/` | PRD 写作风格（章节结构、用词习惯、导出模板、决策评审模板） | 常用 |
| `presets/` | 行业风格 / 文案框架 / DOCX·PDF 导出预设 | 生成/导出时 |
| `ui-specs/` | UI 设计规范（颜色、字体、组件） | 常用 |
| `visual-anchor/` | 原型视觉锚点包 request/manifest 协议 | 需要视觉锚定原型时 |
| `project-index/` | 项目级 3 层 README 索引模板 | 项目初始化 / 索引维护 |
| `knowledge-base/` | 知识库 6 类卡片目录（内容本机沉淀，不入库） | 知识沉淀 / 检索 |

---

## 📊 模板类型对比

| 模板类型 | 所在文件夹 | 影响内容 | 使用时机 |
|----------|-----------|----------|---------|
| **写作风格** | `prd-styles/` | PRD 文字描述、章节结构、导出样式 | 生成 PRD 文档时 |
| **导出/行业预设** | `presets/` | DOCX/PDF 导出配方、行业风格、文案框架 | 导出 / 风格定制时 |
| **UI 规范** | `ui-specs/` | 原型视觉、颜色、字体、间距 | 生成原型时 |
| **视觉锚点包** | `visual-anchor/` | 跨 Claude/Codex 的视觉稿生成交接 | 高保真原型或现网改版时 |
| **项目索引** | `project-index/` | 项目根/PRD/参考资料 3 层 README | 项目初始化时 |

---

📁 **上传你的模板文件到对应目录即可自动生效**
