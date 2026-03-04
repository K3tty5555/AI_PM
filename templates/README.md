# AI_PM 模板库

> 存放各类配置模板和设计资源，供 AI_PM 技能使用

---

## 📁 文件夹结构

```
templates/
│
├── README.md                      # 📄 本说明文件
│
├── examples/                      # 📝 示例文件
│   └── requirement.md             #    需求示例（供参考）
│
├── configs/                       # ⚙️ 配置模板
│   ├── project-config.json        #    项目配置模板
│   └── reference-config.md        #    参考资源配置模板
│
├── prd-styles/                    # ✍️ PRD 写作风格库
│   ├── README.md                  #    使用说明
│   ├── default/                   #    默认风格
│   └── enterprise-standard/       #    企业标准风格
│
├── ui-specs/                      # 🎨 UI 设计规范库
│   ├── README.md                  #    使用说明
│   ├── enterprise-sample/         #    企业规范示例
│   └── [用户自定义规范]/           #    你的 UI 规范
│
├── retrospectives/                # 🔍 项目复盘模板
│   └── retrospective-template.md  #    复盘报告模板
│
└── agent-team/                    # 🤖 多代理协作模板
    ├── README.md                  #    使用说明
    ├── task-template.json         #    任务定义模板
    ├── project-status-template.json #  项目状态模板
    ├── communication-log-schema.json # 通信日志Schema
    └── retrospective-template.md  #    项目复盘模板
```

---

## 🚀 快速开始

### 1. 项目配置

复制配置模板到项目：
```bash
cp templates/configs/project-config.json \
   output/projects/你的项目/07-references/
```

### 2. UI 规范（多项目共享）

创建你的 UI 规范：
```bash
mkdir templates/ui-specs/my-company
cp templates/ui-specs/enterprise-sample/* \
   templates/ui-specs/my-company/
```

### 3. PRD 写作风格

分析你的 PRD 创建写作风格：
```bash
# 分析你的 PRD 文件，自动提取写作风格
/ai-pm-config writing-style analyze ~/path/to/your-prd.md

# 查看所有可用写作风格
/ai-pm-config writing-style list
```

### 4. Agent Team 多代理协作

使用 Agent Team 启动复杂项目：
```bash
# 启动完整团队处理需求
/agent-team "开发一个智能客服系统"

# 查看项目状态
/agent-team status

# 使用 CLI 工具查看详细状态
.claude/skills/agent-team/agent-team-cli.sh status
```

---

## 📌 各文件夹说明

| 文件夹 | 用途 | 使用频率 |
|--------|------|---------|
| `examples/` | 示例文件，供参考学习 | 偶尔查看 |
| `configs/` | 项目配置、参考资源配置 | 按需复制 |
| `prd-styles/` | PRD 写作风格（章节结构、用词习惯、导出模板） | 常用 |
| `ui-specs/` | UI 设计规范（颜色、字体、组件） | 常用 |
| `retrospectives/` | 项目复盘报告模板 | 项目结束时 |
| `agent-team/` | 多代理协作任务、状态模板 | 复杂项目 |

---

## 💡 使用建议

1. **UI 规范** → 放入 `ui-specs/`，所有项目共享
2. **写作风格** → 通过 `/ai-pm-config writing-style analyze` 创建，保存到 `prd-styles/`
3. **项目配置** → 复制 `configs/` 的模板到项目 `07-references/`
4. **文档模板** → 上传到对应 `*-templates/` 或 `*-styles/` 文件夹
5. **复盘模板** → 项目结束后使用 `retrospectives/` 的模板

---

## 📊 模板类型对比

| 模板类型 | 所在文件夹 | 影响内容 | 使用时机 |
|----------|-----------|----------|---------|
| **写作风格** | `prd-styles/` | PRD 文字描述、章节结构 | 生成 PRD 文档时 |
| **UI 规范** | `ui-specs/` | 原型视觉、颜色、字体、间距 | 生成原型时 |
| **项目配置** | `configs/` | 项目基本信息、参考资源 | 项目初始化时 |
| **协作模板** | `agent-team/` | 任务分配、状态跟踪 | 多代理协作时 |

---

📁 **上传你的模板文件到对应目录即可自动生效**
