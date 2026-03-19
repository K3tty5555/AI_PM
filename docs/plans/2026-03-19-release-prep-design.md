# 正式版发布准备设计文档

日期：2026-03-19

## 背景

AI PM 客户端（Tauri v2 + React）准备发布首个正式内部版本，面向公司内部团队，覆盖 macOS + Windows 双端。发布前需修复稳定性缺口、补全功能、建立测试流程，最终输出可分发安装包。

---

## 模块一：稳定性修复

### 1. 全局 ErrorBoundary

**问题**：`main.tsx` 无 ErrorBoundary，组件渲染错误直接白屏，用户无法恢复。

**方案**：在 `RouterProvider` 外层包 React class ErrorBoundary，捕获渲染错误，展示「出了点问题 + 重新加载」恢复界面。

**涉及文件**：
- 新增 `app/src/components/error-boundary.tsx`
- 修改 `app/src/main.tsx`

---

### 2. 清理空 catch 块

**问题**：多处 `.catch(() => {})` 吞掉错误，用户操作失败无任何反馈，难以排查。

**受影响文件**：
- `app/src/components/new-project-dialog.tsx`
- `app/src/hooks/use-ai-stream.ts`
- `app/src/pages/project/Prd.tsx`
- `app/src/pages/project/Research.tsx`
- `app/src/pages/tools/Data.tsx`
- `app/src/pages/tools/Knowledge.tsx`

**方案**：空 catch 改为有意义处理——开发模式 `console.error`，生产模式更新对应 error state 供 UI 展示。不改动业务逻辑。

---

## 模块二：功能补全

### 3. DesignSpec 删除功能

**问题**：设计规范只能重命名，无法删除。

**方案**：
- Rust 端新增 `delete_ui_spec(name)` 命令：校验名称 → 删除 `ui-specs/{name}/` 目录
- 注册到 `lib.rs`
- `tauri-api.ts` 新增 `deleteUiSpec` 绑定
- `DesignSpec.tsx` 卡片头部加 Trash2 图标，点击弹确认 dialog，确认后删除并更新本地 state

**涉及文件**：
- `app/src-tauri/src/commands/templates.rs`
- `app/src-tauri/src/lib.rs`
- `app/src/lib/tauri-api.ts`
- `app/src/pages/tools/DesignSpec.tsx`

---

### 4. 首次启动引导

**问题**：新用户首次打开 Dashboard，无任何引导，不知道要先填 API Key。

**方案**：Dashboard 挂载时检测 `hasConfig === false`（已有此字段，无需新 API），若成立则展示轻量引导 modal：
- 说明需要配置 Claude API Key 才能使用 AI 功能
- 提供「去设置」按钮跳转 Settings 页
- 用户填完 key 后 modal 自动消失（下次 hasConfig 为 true）
- 通过 localStorage 标记「已关闭引导」，避免重复打扰已手动关闭的用户

**涉及文件**：
- `app/src/pages/Dashboard.tsx`（或新增 `app/src/components/onboarding-modal.tsx`）

---

## 模块三：测试策略

### Claude 负责（Playwright 自动化）

启动开发模式后，用 Playwright MCP 跑以下核心路径：

| 测试项 | 验证内容 |
|--------|---------|
| 路由导航 | 所有页面可访问，无白屏 |
| 项目创建 | 新建项目流程正常 |
| 项目重命名 | inline rename 交互正确 |
| 项目删除 | 删除后列表更新 |
| 产品分身 rename | 铅笔图标、input、确认流程 |
| 设计规范 rename | 同上 |
| 设计规范删除 | 新功能验证 |
| ErrorBoundary | 触发错误后显示恢复界面 |
| 首次引导 modal | hasConfig=false 时显示 |
| 设置页 | API Key 填写流程 |

### 用户负责（手动）

| 测试项 | 说明 |
|--------|------|
| AI 流式输出 | 真实调用 Claude API，验证输出质量 |
| DOCX/PDF 导出 | 导出后用本机软件打开，确认格式正常 |
| Windows 端冒烟 | 在 Windows 机器上跑一轮核心路径 |

---

## 模块四：打包 & 分发

- macOS：`npm run tauri build` → 输出 `.dmg`
- Windows：在 Windows 环境执行同命令 → 输出 `.msi` / `.exe`
- 分发方式：飞书/企微/网盘发给内部用户

---

## 不在本次范围内

- 自动化 CI/CD 流水线
- 版本更新推送（auto-updater）
- config.rs 中低风险 `unwrap()` 重构（风险极低，推后处理）
- Playwright E2E 测试持久化（手动验收为主，自动化测试下个版本迭代）
