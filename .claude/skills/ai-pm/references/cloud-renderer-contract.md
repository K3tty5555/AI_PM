# 云渲染器契约（Cloud Renderer Contract）

> AI_PM 的 PRD 生成只产出**一份带通用富文档标记的 `.md`**（语义源）。把这份 `.md` 渲染并推送到云端协作文档（高亮块 / 调色 / 折叠 / 分栏 / 表格指令）是**可插拔的一层**——由一个独立的「云渲染器」skill 实现。
>
> 本契约定义：渲染器怎么被**发现**、要声明哪些**能力**、PRD 生成侧据此怎么**按能力增量**输出标记。**仓库只放契约 + 通用规则 + 能力探测；具体某家云平台的渲染器、凭证、域名、集成事实都是各自插件的私事，不在本契约、也不应入库。**

---

## 一、为什么是契约而非硬编码

PRD 生成（`cloud_doc_enhanced` 档）会 emit 一批通用标记：callout（`> [!TIP]` / `> [!WARNING]`）、调色（`<红>` / `<灰>`）、高亮（`==核心==`）、表格指令（`<!-- table:... -->`）等（**标记语义的单一权威源在 `pm-judgment-card.md` §十**，本契约不复制、只引用）。

这些标记是**通用约定**，不绑定任何具体云平台。谁来把它们渲染成真正的云文档块，由「云渲染器」插件提供。好处：

- **语义源唯一**：PRD 生成规则只有一套，不为每个云平台维护一份。
- **无死码、不泄漏**：没装任何云渲染器的用户 clone 仓库，看到的是「可扩展系统 + 扩展点」，不是半截能用的私有集成；也看不出原作者用了哪家云平台。
- **按能力降级**：渲染器声明自己支持哪些能力，PRD 生成只 emit 对方撑得住的标记，不会 emit 一堆对方渲染不了的语法。

---

## 二、发现机制（单一路径）

PRD 生成在询问「要不要云文档增强」前，**只扫描一个 glob**：

```
.claude/skills/*/cloud-renderer.json
```

- **机器入口只有这一条**。每个想充当云渲染器的 skill，在自己根目录放一个 `cloud-renderer.json`（manifest）。
- skill 的 `SKILL.md` / `README.md` **仅供人读说明**，**不作为机器发现入口**——两套入口会漂移、会误判，统一只认 `cloud-renderer.json`。
- 扫到 0 个满足最低能力的 manifest → **不提供** `cloud_doc_enhanced` 档（详见 §五）。

---

## 三、Manifest schema（`cloud-renderer.json`）

```jsonc
{
  "id": "my-cloud-renderer",            // 唯一标识（kebab-case）
  "display_name": "我的云文档渲染器",     // 给用户看的名字
  "version": "1.0.0",                   // 语义化版本
  "skill_name": "my-cloud-renderer",    // 调用入口：哪个 skill 实现渲染+推送
  "config_required": ["app_id", "app_secret", "domain"],  // ⚠️ 只列「需要哪些配置字段名」
  "capabilities": {
    "render_and_push": true,            // ▼ 最低三件（缺一即不达标，见 §四）
    "callout": true,
    "text_color": true,
    "background_highlight": true,        // ▼ 增量能力（各自 gate）
    "table_directives": true,
    "table_cell_images": true,
    "folded_heading": true,
    "grid_columns": true,
    "file_attachment": true
  }
}
```

### `config_required` 的隐私铁律

`config_required` **只声明需要哪些配置字段的名字**（如 `app_id` / `app_secret` / `domain`），**绝不写入任何真实值、真实域名样例、租户标识**。配置的真值由各插件自己在本机存放（环境变量 / 本地 config），**不进 manifest、不进仓库**。本契约文档同此约束——通篇不出现任何具体云平台名 / 域名。

### `capabilities` 字段表

| 字段 | 含义 | 对应 PRD 标记（§十） |
|---|---|---|
| `render_and_push` | 把 `.md` 渲染成云文档块并推送/更新 | 整篇 `.md` |
| `callout` | GitHub-alert 语法 → 高亮块 | `> [!TIP]` / `> [!WARNING]` |
| `text_color` | 行内字体色 | `<红>词</红>` / `<灰>次要</灰>` |
| `background_highlight` | 行内黄底高亮（马克笔） | `==核心==` |
| `table_directives` | 表格排版指令（表头行/列、列宽、合并） | `<!-- table:... -->` |
| `table_cell_images` | 表格单元格内图片块 | 详细功能设计「原型示意」cell 内 `![原型](path)<br>描述` |
| `folded_heading` | 可折叠标题段（折叠其后 section） | `<!-- fold -->` + 下一个标题 |
| `grid_columns` | 多列分栏 | `<!-- columns:N -->` … `<!-- col -->` … `<!-- /columns -->` |
| `file_attachment` | 文件附件块 | 真附件源侧语法由渲染器自定义；**不支持时降级为纯文本行** `📎 附件：…`（`📎 附件：…` 是降级文本、非可渲染附件标记，勿误当源侧语法） |

---

## 四、最低能力门槛

`render_and_push` + `callout` + `text_color` **三者全为 `true`** 才算「**可用的云渲染器**」。理由：这三件是 `cloud_doc_enhanced` 档最基础的承重能力（推送 + 段落级提示 + 语义调色），缺任一项，云增强体验就半残。

其余六项（`background_highlight` / `table_directives` / `table_cell_images` / `folded_heading` / `grid_columns` / `file_attachment`）是**增量能力**：

- 达标的渲染器**未必全支持**这些增量能力——**「`cloud_doc_enhanced` 可用」≠「全增强可用」**。
- PRD 生成对增量能力**逐特性 gate**：对方声明 `false` 的能力，**不 emit 对应标记**（避免 emit 一堆渲染不了的语法、污染输出）。

---

## 五、PRD 生成侧怎么用（探测 → 传递 → 逐特性 gate）

1. **探测**（phase-5 步骤 A.0.2）：扫 `.claude/skills/*/cloud-renderer.json`。
   - 有满足最低能力的渲染器 → 才向用户提供 `cloud_doc_enhanced` 档选项。
   - 无、或只有半残（最低三件没凑齐）→ **不展示** `cloud_doc_enhanced`，默认 `markdown` 档 + 一句「配置云渲染器插件后可启用云文档增强」。

2. **传递**（关键，否则探测只停在 phase-5、生成端照样 emit 不支持的标记 —— 同 `output_profile` 的注入坑，见 [[PITFALL-108]]）：探测到渲染器后，把它的 `capabilities` **写进 `_status.json` 的 `checkpoints.prd.cloud_renderer_capabilities`**，再**注入 pm-agent prompt**（与 `output_profile` 同一注入路径、同样「必须替换实参、不原样传占位」）。

3. **逐特性 gate**（pm-agent / phase-5 生成时）：
   - `background_highlight=false` → 禁 emit `==核心==`
   - `table_directives=false` → 禁 emit `<!-- table:... -->`
   - `table_cell_images=false` → 禁在「原型示意」cell 内 emit `![](path)`，退回文字占位 / 待补原型说明
   - `folded_heading=false` → 禁折叠结构
   - `grid_columns=false` → 禁分栏结构
   - `file_attachment=false` → 退化成纯文本附件行

> 标记的**语义与写法**（什么时候用 `<红>`、`==核心==` ≤2 处等）的单一权威源仍是 `pm-judgment-card.md` §十；本契约只管「对方撑不撑得住这个能力」。两者正交：§十 管「该不该用」，契约管「能不能用」。

---

## 六、如何加你自己的云渲染器

1. 新建一个 skill（或复用现有云文档 skill），实现两件事：把带上述标记的 `.md` **渲染**成你那家云平台的文档块、并**推送/更新**到目标文档。
2. 在该 skill 根目录放 `cloud-renderer.json`，按 §三 填写：
   - `skill_name` 指向你的 skill（调用入口）；
   - `config_required` **只列字段名**（你的渲染器需要哪些凭证/域名配置），真值放本机、别写进 manifest；
   - `capabilities` 如实声明你支持哪些——**没实现的写 `false`**，PRD 生成会自动跳过对应标记，不会 emit 你渲染不了的语法。
3. 至少把 `render_and_push` / `callout` / `text_color` 三件做到 `true`，才会被探测为「可用云渲染器」。
4. 你的 skill、凭证、域名、集成方式**都是你的私事**——可以 gitignore、可以本机专属，**不必、也不应入库**。仓库只认你的 `cloud-renderer.json` 这张名片。

---

## 七、边界

- **md2docx（本地 docx 渲染器）不在本契约内**：它把 `.md` 渲染成本地 Word/PDF，**不消费云文档标记、不推云端**——与「云渲染器」是不同角色，不强塞进同一契约（接 [[feedback_use_existing_tools]]）。
- **本契约是文档约定 + manifest marker，不是重代码接口**：AI_PM 是 skills + 方法层，够探测 + 够 how-to 即可，别过度工程（接 [[feedback_pilot_to_capability]]）。

---

*版本：v0.1（2026-06-30）| 配套：pm-judgment-card.md §十（标记语义单一源）/ phase-5-prd.md 步骤 A.0.2（探测+传递）| 引用方：phase-5-prd.md, pm-agent.md*
