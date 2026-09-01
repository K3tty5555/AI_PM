# 原型协作闭环

本参考定义 AI_PM 原型阶段的通用协作产物。生成或修改原型时，只要涉及新页面、页面结构、主流程或关键状态变化，就读取本文件。

## 目标链路

`关键帧规格 → 中保真线框画廊确认 → 精细原型 → 精细原型巡检工作台 → 页面定点标注 → 修改预览 → 用户确认修改 → 复核 → 截图回写 active PRD → 云文档定点同步（按需）`

用户提供云文档、历史 PRD 或“之前版本原型”时，先读事实源和截图，再生成或修改原型；用户说“意见已提交”时，以 `feedback/` 中最新导出的 JSON 为准，读取巡检意见和页面标签两类反馈。

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

## 中保真线框确认门

线框必须是一个能同时浏览全部关键流程和关键帧的 HTML。它不做品牌视觉和细节还原，但必须看清实际页面排版：真实栏宽比例、导航、表单、列表、表格、画布、弹窗、操作区和状态提示不能只用抽象方块代替。

生成命令：

```bash
python3 scripts/aipm_prototype_collab.py render-lowfi \
  --spec "{项目目录}/06-prototype/prototype-spec.json" \
  --out "{项目目录}/06-prototype/lowfi/index.html"
```

每个关键帧下方必须能记录确认状态和评论。用户导出的 `lowfi-approval.json` 必须满足：

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
  --out "{项目目录}/06-prototype/review/index.html"
```

巡检状态：未检查、通过、有问题、待复核、不适用。浏览器 localStorage 只作为工作副本，导出的 `review-feedback.json` 才是正式交换产物。

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

需要让页面评论和标签直接写回项目、供 AI 下一轮读取时，启动只监听本机的预览服务：

```bash
python3 scripts/aipm_prototype_collab.py serve \
  --root "{项目目录}/06-prototype" \
  --port 8765
```

通过该地址打开低保真、精细原型或巡检页，提交的内容会写入 `06-prototype/feedback/`。直接双击 HTML 时自动降级为 localStorage + JSON 下载。

## 截图与文档回写

只有用户明确授权浏览器核验时才做视觉截图。截图必须覆盖规格中的每个关键状态，并隐藏标注浮层、临时 toast 和非产品调试层；同时记录视口、SHA-256、控制台错误、页面错误和横向溢出。

截图通过后更新 active PRD 的“原型示意”图片和说明；用户要求同步 i讯飞时，使用 `xfchat-wiki` 的增量流程：先读最新版，按 heading 定点替换，原型图片写入对应表格单元格，最后运行 `validate_prd_prototype_cells.py`。禁止对已有云文档使用 `clear_first=True`，避免覆盖人工编辑。

复杂主流程在 PRD“核心流程”中使用 Mermaid 代码块；i讯飞 API 会落成代码块，需在文档侧手动开启流程图插件时才会显示为图。
