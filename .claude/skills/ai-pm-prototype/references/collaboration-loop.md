# 原型协作闭环

本参考定义 AI_PM 原型阶段的通用协作产物。

⚠️ **动原型就读本文件，无条件读、先读再动手**。不要先判"这次算不算结构变化"再决定读不读——**那个判断本身正是本文件要约束的东西**。2026-09-19 实跑翻车实证：判成「已确认壳层上的局部加字段、不算结构变化」→ 不读本文件 → `prototype-spec.json`、低保真确认门、巡检画廊三件全漏，运行时还手工塞进了 HTML（违反 `templates/prototype-collab/DESIGN.md`「不得只手改项目 HTML」）。而本文件从头到尾都写着这些该怎么做。**能省掉的只有闸本身，省不掉读。**

## 目标链路

`关键帧规格 → 中保真线框画廊确认 → 精细原型 → 精细原型巡检工作台 → 页面定点标注 → 修改预览 → 用户确认修改 → 复核 → 截图回写 active PRD → 云文档定点同步（按需）`

用户提供云文档、历史 PRD 或“之前版本原型”时，先读事实源和截图，再生成或修改原型；用户说“意见已提交”时，以 `feedback/` 中最新写入的 JSON 为准（serve 提交直接落盘；降级下载的 JSON 需用户提供路径），读取巡检意见和页面标签两类反馈。

## 单一事实源

`06-prototype/prototype-spec.json` 只承载页面、关键帧、流程和稳定元素 ID，不复制 PRD 业务规则正文。

最低要求：

- 每个页面有稳定 `page_id`。
- 每个关键帧有稳定 `state_id`，覆盖主流程及必要的空、加载、错误、成功、权限状态。
- 每个主流程有 `flow_id` 和有序 steps。
- 需要被巡检或标注的功能点登记 `target_id`；精细原型对应元素写 `data-aipm-id="{target_id}"`。
- 规格必须通过：

```bash
python3 scripts/aipm_prototype_collab.py validate \
  "{项目目录}/06-prototype/prototype-spec.json"
```

schema：`templates/project-index/prototype-spec.schema.json`。

用户确认的栏位职责是硬约束，必须写进关键帧 layout 或交接说明。以“左题目列表 / 中试卷切图 / 右答案设置”为例：中间负责区域框和区域编辑操作，右侧只负责答案与分值；不能因为生成器默认存在右侧 panel 就把作答区操作塞进右栏。

## 设计稿来源的视觉锚点包

设计稿已定稿时，用一条命令把它抽成视觉锚点包：

```bash
python3 scripts/aipm_prototype_collab.py ingest-design \
  --url "{带 layer_id 的 MasterGo 地址}" \
  --out "{项目目录}/06-prototype-visual"
```

产物与 Codex 来源同构，`manifest.source=mastergo`，门禁与鲜度校验完全复用。

三条必须守的：

- **URL 必须带 `layer_id`，且要指向画板。** 只给 `page_id` 会拿到空结构——画布本身没有 DSL。
- **还原稿是只读基准，不是交付原型。** 它是绝对定位死版面、没有交互、图标是占位块。
  任何情况下不得直接拿去评审。
- **设计稿没画到的页面，布局沿用最新已确认原型**，只把 token 与组件规格刷成设计稿那套。
  不要从画了的几页外推出设计师没画过的布局。

稿内的 `interactive` 跳转会落进 `structures/{pageId}.json`，拿来与 `prototype-spec.json`
的状态和 route 对一遍即可，**不自动改 spec**——spec 里的状态来自 PRD，设计稿只是佐证。

## 已确认结论：动手前先把用户拍过的约束捞出来

反馈 JSON 里躺着的不只是"某一轮的历史记录"，还有**跨版本长期有效的约束**——用户对栏位职责、交互形态、文案口径下过的判断，不会因为换了版本号就失效。

```bash
python3 scripts/aipm_prototype_collab.py standing-decisions --root "{项目目录}/06-prototype"
```

输出按来源文件分组，覆盖各版本 `feedback/`（含 `历史版本/` 下的）：`decision` / `confirmation_source` / `skip_reason`，以及每条巡检评论、标签与修改意见，带 `page_id::state_id` 归属。

**规则**：挑基线、画栏位、定交互之前逐条读完；与之冲突的改动先问用户。命令**不做语义筛选**——按相关性过滤听着聪明，但漏掉的那条往往正是最要命的那条。

> 2026-09-20 实证：V6 巡检里用户写过两遍「布局有问题，应该是左边实体列表，中间是试卷切图，右边是设置批改参数」，还写过「这一个侧边栏都不存在」。这些文件当时被读过，但那几句被当成 V6 的历史记录扫过去了，结果 V7 把已确认的三栏做成两栏。**问题不是信息不在，是没有一个动作逼着把它们并排看一遍。**

## 并行版本：多个版本同时在做时放哪

上面所有路径都写成 `06-prototype/` 下的单份产物（`prototype-spec.json` / `lowfi/` / `review/` / `feedback/`）。**这套单份布局只对"同一时间只有一个版本在推"成立。**

迭代项目经常是上一版还在评审、下一版已经起草（实例：V6 高保真第三轮待验收时 V7 开始出原型）。此时**不要覆盖在制品的 spec 与 feedback**——审批 hash、巡检结论和标签会一起丢。约定：

```
06-prototype/
├── prototype-spec.json      # 仍归当前主线版本（在制品）
├── lowfi/ review/ feedback/ # 同上
├── {版本号}/                 # 并行版本自带一套，如 V7/
│   ├── prototype-spec.json
│   ├── review/index.html
│   └── feedback/lowfi-approval.json
├── {版本号}-source-target-manifest.json
└── 当前版本/                 # 各版本的精细原型 HTML 并列放这里，按文件名区分
```

- 精细原型 HTML **不分目录**，仍放 `当前版本/`，靠文件名带版本号区分（沿用本项目既有做法）。
- `aipm_contracts.py prototype` 只认 `06-prototype/source-target-manifest.json`；并行版本的对照表用 `{版本号}-source-target-manifest.json`，契约校验需手动指定或跳过，**跳过时在交接说明里写明**。
- 并行版本收敛（主线版本上线/废弃）后，把并行目录的内容提回单份布局，旧版进 `历史版本/`。

## 截图工具链不可用时怎么办

`ai-pm/SKILL.md` 假定有 Playwright。本机没装 Playwright（无 `node_modules`、`require.resolve('playwright')` 失败）时，**不要下载浏览器**，按 CLAUDE.md 复用本机缓存：

```bash
SHELL_BIN=~/Library/Caches/ms-playwright/chromium_headless_shell-<ver>/chrome-headless-shell-mac-arm64/chrome-headless-shell
"$SHELL_BIN" --headless --disable-gpu --no-sandbox \
  --virtual-time-budget=2200 --window-size=1440,1080 \
  --screenshot=out.png "file:///绝对路径/原型.html#f=<关键帧>"
```

⚠️ **chrome-headless-shell 只能截图，不能点击**。这条降级路径拿到的是「静态渲染后的视觉核对」，**不是交互回归**：

- 关键帧必须能**只靠地址**直达（URL query 或 hash 驱动状态），否则截不到非默认态。
- ⚠️ 用 hash 直达（`#f=帧名`）时，**业务原型必须挂 `hashchange` 监听**——巡检画廊切帧只变 hash、不重载页面，脚本不会重跑；且切帧前先复位到初始 state 再叠加帧增量，否则上一帧状态会残留。query 直达（V6 做法）每切一帧整页重载，天然无此问题。V7 踩过：切帧页面不动 + 标注运行时把标签记到旧帧（运行时侧已在通用模板里修，业务原型侧每次要自己写，2026-09-20）。
- 截图前隐藏 `#aipm-annotation-host` 与临时 toast。
- manifest 与审计里必须如实写「仅静态渲染核对，未做真实点击回归」，**不得报成"全流程验证通过"**。
- 想要真交互回归，走 Playwright MCP 或 `serve` + 手动点。

## 源码证据与视觉 Token

用户指定代码仓、源码目录或资料文件夹时，先运行 `scan-source` 生成来源证据 manifest，记录页面、组件、字体、颜色、图片和布局信号，只保留相对路径与 hash。业务视觉证据只用于业务原型。前两步工作台和标签浮层统一读取 `templates/prototype-collab/DESIGN.md` 与同目录默认 Token；只有用户明确要覆盖工作台时才传 `--tokens`，不自动把业务品牌色传给工作台。`emit-tokens` 输出的是工作台 Token，不是业务产品设计规范。

```bash
python3 scripts/aipm_prototype_collab.py scan-source --source "{代码仓或资料目录}" --out "{项目目录}/06-prototype/source-evidence.json"
python3 scripts/aipm_prototype_collab.py emit-tokens --out "{项目目录}/06-prototype/visual-tokens.json"
```

## 中保真线框确认门

低保真总览的视觉基线见 [collaboration-workbench-visual-spec.md](collaboration-workbench-visual-spec.md)，具体规则单源为 `templates/prototype-collab/DESIGN.md`：桌面端单列，每帧左侧展示页面、右侧录入反馈，窄屏反馈移到下方。工作台样式不进入线框内部或业务原型。

线框必须是一个能同时浏览全部关键流程和关键帧的 HTML。它不做品牌视觉和细节还原，但必须看清实际页面排版：真实栏宽比例、导航、表单、列表、表格、画布、弹窗、操作区和状态提示不能只用抽象方块代替。

生成命令：

```bash
python3 scripts/aipm_prototype_collab.py render-lowfi \
  --spec "{项目目录}/06-prototype/prototype-spec.json" \
  --out "{项目目录}/06-prototype/lowfi/index.html"
```

每个关键帧旁必须能记录确认状态和评论（窄屏位于下方）。用户导出的 `lowfi-approval.json` 必须满足：

- `spec_hash` 等于当前规格 hash。
- `decision=approved` 才能进入精细原型生成。
- `decision=revise` 时先修改规格和低保真；规格变更后旧确认失效。

进入精细原型前运行门禁：

```bash
python3 scripts/aipm_prototype_collab.py verify-approval \
  --spec "{项目目录}/06-prototype/prototype-spec.json" \
  --approval "{用户导出的 lowfi-approval.json}"
```

默认强制：0→1 原型，以及页面结构、主流程、关键状态变化。纯视觉调整或局部小修只有用户明确要求时可跳过，并记录 `decision=skipped + skip_reason`。

只调整工作台外壳或标签工具的视觉时不修改业务 spec，有效审批原样沿用，不写新的 `skipped` 覆盖已有 `approved`。重新运行通用生成器产出两步界面；标签运行时更新后再 instrument，核对业务文件除运行时引用外内容一致。

## 精细原型巡检画廊

精细原型完成后生成独立巡检 HTML。桌面端采用左侧关键帧导航、中间单一真实原型视窗、右侧评论区；支持上一页、下一页和流程筛选。左侧导航和右侧评论区都必须可独立收起，收起后保留清晰的恢复入口，并记住用户上次的展开状态。中间 iframe 必须有加载中和超时提示，不能以白屏代替错误状态；iframe 和运行时资源地址必须带内容版本参数，标注路由要忽略版本参数。窄屏时评论区移到下方，不把多个 iframe 纵向堆叠。

先向精细原型关键元素写入 `data-aipm-id`，再执行：

```bash
python3 scripts/aipm_prototype_collab.py instrument \
  --spec "{项目目录}/06-prototype/prototype-spec.json" \
  --html "{项目目录}/06-prototype/index.html"

python3 scripts/aipm_prototype_collab.py render-review \
  --spec "{项目目录}/06-prototype/prototype-spec.json" \
  --prototype "{项目目录}/06-prototype/index.html" \
  --approval "{项目目录}/06-prototype/feedback/lowfi-approval.json" \
  --out "{项目目录}/06-prototype/review/index.html"
```

`render-review` 强制校验 `lowfi-approval.json`：文件必须存在、`spec_hash` 与当前规格一致，且 `decision=approved`；规格发生变化后必须重新走低保真确认。

确认门按上一节被**有意跳过**时（`decision=skipped` + 非空 `skip_reason`），显式加 `--allow-skipped` 才渲染，命令会打印 `WARN: 低保真确认门被跳过` 并回显 skip_reason。`accept` 同此。⚠️ **不要为了让 render-review 跑通而把 skipped 改写成 approved** —— 那会让"跳过"在留痕里伪装成"通过"，审批记录从此不可信。

原型收口时运行 `accept` 统一检查规格、低保真审批、HTML 资源、反馈和截图 manifest；原型更新后运行 `diff-prototype` 留下版本差异。`modification-preview` 只生成计划，不自动修改原型。

巡检状态：未检查、通过、有问题、待复核、不适用。浏览器 localStorage 只作为工作副本；serve 提交写入的（或降级导出的）`review-feedback.json` 才是正式交换产物。

**交付画廊默认走 serve，不走 file://**。`render-lowfi` / `render-review` 完成时会打印 `SERVE:`（起服务命令）和 `OPEN:`（交付地址）两行，按它执行：

```bash
python3 scripts/aipm_prototype_collab.py serve --root "{项目目录}/06-prototype" --port 8765
```

- 通过 localhost 地址打开的页面，提交直接写回项目 `feedback/`，AI 读文件即可，用户不经手任何 JSON 文件。
- 并行版本的画廊地址是 `REVIEW[{版本号}]` 那行（如 `…:8765/V7/review/index.html`），起服务时的横幅会自动列出。
- 直接 `open` HTML（file://）是**降级路径**：fetch POST 不可用，提交退化为浏览器下载 JSON，页面会显式提示「未连接项目服务」。看到这种提示说明交付方式错了（该走 serve），不是用户操作错了。

## 页面定点标注

标注运行时支持三类用途：

- `feature-note`：功能说明；需要引用 PRD、学习文档、操作手册或链接时，直接写在内容中。
- `review-comment / question`：评审评论和问题。
- `change-request`：给 AI 的修改意见，内容中写清要改什么及期望效果。

标签表单只保留“类型”和“内容”两个输入项，减少评审时的记录成本；已有标签支持“删除标签”，删除前二次确认。历史 JSON 中的标题、文档关联、期望结果字段继续兼容，但不再在表单和列表中展示。

锚点优先级：`data-aipm-id` → CSS selector → 文字指纹 → 归一化坐标。目标找不到时标为 `anchor-drift`，不得静默贴到其他元素。

标注导出为 `annotations.json`。生成 AI 修改预览：

```bash
python3 scripts/aipm_prototype_collab.py summarize-feedback \
  --feedback "{标注或巡检反馈 JSON}" \
  --out "{项目目录}/06-prototype/feedback/modification-preview.md"
```

修改预览只列计划，不自动修改。用户明确确认后，才由原型 owner 修改 `prototype-spec.json` 和精细原型；完成后对应反馈转为待复核，由用户决定是否关闭。反馈处理必须同时检查“整帧评论”和“页面标签”，不能只读其中一个 JSON。

## 反馈契约

schema：`templates/project-index/prototype-feedback.schema.json`。

校验：

```bash
python3 scripts/aipm_prototype_collab.py validate --kind feedback "{feedback.json}"
```

首版默认本地单人使用，不建账号、数据库或多人实时协作。所有运行时本地托管，不引用 CDN，不上传原型或反馈数据。

需要让页面评论和标签直接写回项目、供 AI 下一轮读取时，启动只监听本机的预览服务（**这就是上一节的交付默认**，不只是可选项）：

```bash
python3 scripts/aipm_prototype_collab.py serve \
  --root "{项目目录}/06-prototype" \
  --port 8765
```

通过该地址打开低保真、精细原型或巡检页，提交的内容按 `spec_hash` 自动路由——命中哪份 `prototype-spec.json`（主线或 `{版本号}/` 并行版本）就写进哪个目录的 `feedback/`，版本间不混写。直接双击 HTML 时自动降级为 localStorage + JSON 下载，页面提示「未连接项目服务」。

## 截图与文档回写

只有用户明确授权浏览器核验时才做视觉截图。截图必须覆盖规格中的每个关键状态，并隐藏标注浮层、临时 toast 和非产品调试层；同时记录视口、SHA-256、控制台错误、页面错误和横向溢出。

截图通过后更新 active PRD 的“原型示意”图片和说明；用户要求同步企业云文档时，使用项目登记云文档 skill 的增量流程：先读最新版，按 heading 定点替换，原型图片写入对应表格单元格，最后运行结构校验脚本。禁止对已有云文档使用 `clear_first=True`，避免覆盖人工编辑。

复杂主流程在 PRD“核心流程”中使用 Mermaid 代码块；云文档 API 通常会落成代码块，需在文档侧手动开启流程图插件时才会显示为图。
