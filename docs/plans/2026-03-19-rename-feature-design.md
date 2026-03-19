# 重命名功能设计文档

日期：2026-03-19

## 背景

产品分身、设计规范、项目名称创建后无法修改，需为三者补充重命名能力，且不影响现有功能和文件关联。

---

## 交互方案：双击原地编辑（Inline Edit）

三个对象统一交互模型：

- **Hover** 卡片/列表项头部 → 名称右侧淡入 `✎` 铅笔图标（`opacity-0 group-hover:opacity-100`）
- **点击铅笔图标** → 名称 `<span>` 替换为 `<input>`，自动全选当前文本
- `Enter` 或失去焦点 → 确认提交
- `Esc` → 取消，恢复原名称
- 名称未变 → 退出编辑，不发网络请求

**状态反馈**：

| 状态 | 表现 |
|------|------|
| 保存中 | input 右侧小 spinner，禁止重复提交 |
| 名称为空 | 阻止提交，input 边框红色抖动 |
| 名称冲突 | input 红框 + 下方 `"名称已存在"` |
| 保存失败 | 同上，显示错误原因 |
| 保存成功 | 直接显示新名称，无额外动画 |

---

## 各对象实现细节

### 1. 产品分身（Persona）

**存储**：`templates/prd-styles/{name}/` 目录 + `_active` 纯文本文件

**关联关系**：
- `_active` 文件存储当前激活的分身名称，如重命名后未更新则加载失败
- 分身名称不存储于项目文件中，无项目级关联

**Rust 操作顺序（`rename_prd_style`）**：
1. 用已有 `is_safe_style_name()` 校验 `new_name`（非空、无 `/\`、无前置 `.`）
2. 检查 `prd-styles/{new_name}` 目录不存在
3. `fs::rename(prd-styles/{old}, prd-styles/{new})`
4. 读取 `_active`，若值 == `old_name` → 写入 `new_name`

---

### 2. 设计规范（UI Spec）

**存储**：`templates/ui-specs/{name}/` 目录

**关联关系**：名称不存储于数据库，不被任何项目文件引用 → **最安全，纯目录重命名**

**Rust 操作顺序（`rename_ui_spec`）**：
1. 校验 `new_name`（非空、无路径分隔符、无前置 `.`）
2. 检查 `ui-specs/{new_name}` 目录不存在
3. `fs::rename(ui-specs/{old}, ui-specs/{new})`

---

### 3. 项目名称（Project）

**存储**：SQLite `projects` 表（`name`、`output_dir` 字段） + 磁盘目录 + `_status.json`

**关联关系**（完整清单）：
- `projects.output_dir`：所有文件读写（`read_project_file`）通过此字段定位目录 → **必须更新**
- `projects.name`：显示用，无唯一约束 → **必须更新**
- `_status.json` 中 `project_name` 字段：CLI 兼容性 → **更新（best-effort）**
- `project_phases.output_file`：存储相对路径（如 `05-prd/05-PRD-v1.0.md`），不含绝对路径 → **无需更新**

**数据安全：手动两阶段提交（无原生事务跨 FS+DB）**

操作顺序（`rename_project`）：
1. 校验 `new_name`（非空、无 `/\..`）
2. 查询 DB 确认 `new_name` 未被其他项目使用
3. 检查 `{projects_base}/{new_name}` 目录不存在
4. `fs::rename(old_dir, new_dir)` → 若失败，直接返回错误（无副作用）
5. `UPDATE projects SET name=?, output_dir=?, updated_at=? WHERE id=?` → 若失败，执行 `fs::rename(new_dir, old_dir)` 回滚，返回错误
6. 更新 `_status.json`（best-effort，失败不影响整体结果）

---

## 涉及文件

| 文件 | 变更 |
|------|------|
| `app/src-tauri/src/commands/templates.rs` | 新增 `rename_prd_style`、`rename_ui_spec` |
| `app/src-tauri/src/commands/projects.rs` | 新增 `rename_project` |
| `app/src-tauri/src/lib.rs` | 注册三个新 command |
| `app/src/lib/tauri-api.ts` | 新增 `renamePrdStyle`、`renameUiSpec`、`renameProject` |
| `app/src/pages/tools/Persona.tsx` | `已保存风格` tab：铅笔图标 + inline edit |
| `app/src/pages/tools/DesignSpec.tsx` | 规范卡片头部：铅笔图标 + inline edit |
| `app/src/pages/Dashboard.tsx` | 项目卡片名称：铅笔图标 + inline edit |

---

## 不变更的内容

- 项目阶段输出文件路径（相对路径，不受影响）
- 产品分身和设计规范不存储于项目文件，重命名不影响项目
- 历史生成内容（文件内容本身不包含路径引用）
