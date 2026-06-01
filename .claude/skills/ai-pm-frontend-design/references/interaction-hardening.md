# Interaction Hardening

原型不是静态图。所有核心交互必须有状态、反馈和边界处理。

## 1. Interactive States

核心交互元素至少考虑：

- `default`：静止态。
- `hover`：只用于支持 hover 的设备。
- `focus`：键盘焦点，必须可见。
- `active`：按下反馈。
- `disabled`：明确不可用原因或视觉弱化。
- `loading`：正在处理，避免重复提交。
- `error`：用户能理解并恢复。
- `success`：确认发生了什么，给出下一步。

不要只有 hover，没有 focus。不要移除 `outline` 后不给 `:focus-visible` 替代。

## 2. Touch And Pointer

- 触控目标最小 44px，可用 padding 或伪元素扩大热区。
- 不依赖 hover 才能发现功能；触屏要有可见入口。
- 移动端关键操作放在拇指可达区域。
- 手势必须有可见替代入口，例如滑动删除也要有菜单或按钮。
- 使用 `@media (hover: hover)` 和 `@media (pointer: coarse)` 区分能力，不只按屏幕宽度猜输入方式。

## 3. Forms

- placeholder 不能替代 label。
- 校验优先在 blur 或 submit 时触发；实时校验只用于密码强度、字数等轻反馈。
- 错误文案放在字段附近，说明发生了什么和如何修复。
- 保留用户已输入内容，不因错误清空。
- loading 时禁用重复提交，并给出明确反馈。

## 4. Responsive Hardening

- 移动端先保证核心任务可完成，再考虑视觉完整度。
- 桌面表格在移动端改成卡片、分组列表或横向可控滚动。
- 页面容器不能出现不可控横向滚动。
- 长标题、长姓名、长数字、长标签必须有换行、截断或 `min-width: 0`。
- 需要移动端沉浸时使用 safe-area；普通原型也要避免底部操作被系统手势遮挡。

## 5. Error, Empty, Loading

- 空状态要说明为什么为空，并给出下一步动作。
- loading 说明正在做什么；长等待要给进度或阶段。
- 错误态不要责怪用户，要给恢复路径。
- destructive action 优先用撤销 toast；只有不可逆、高成本或批量操作才用确认弹窗。

## 6. Accessibility Baseline

- 使用语义 HTML：按钮用 `button`，链接用 `a`，表单有 `label`。
- 图标按钮必须有 `aria-label`。
- 焦点顺序符合视觉顺序。
- 文本对比达到可读水平；不要只靠颜色传达状态。
- 支持 200% 浏览器缩放时不重叠、不截断核心信息。
