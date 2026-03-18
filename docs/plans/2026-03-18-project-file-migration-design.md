# 项目文件统一迁移设计文档

**日期：** 2026-03-18
**背景：** 导入的历史项目文件留在原目录，与新建项目的 app 管理目录分散两处，不便于统一管理、备份和查找。

---

## 目标

所有项目文件统一存放在 app 管理目录（`state.projects_dir/{项目名}/`），消除「文件散落两处」的问题。

---

## 方案一：导入行为变更

**现状**：`import_legacy_projects` 将原目录路径直接写入 DB，文件不动。

**改后**：导入时自动将文件 copy 到 `state.projects_dir/{项目名}/`，DB `output_dir` 改为新路径。

### 规则

- 原目录文件保留不动，app 不删除
- 名称冲突（`{projects_dir}/{名}/` 已存在）：目标目录追加 `-imported` 后缀
- copy 失败（无权限等）：fallback 到原路径，正常导入，不阻断流程

### 受影响文件

- `app/src-tauri/src/commands/projects.rs` — `import_legacy_projects`
- 需要 `copy_dir_recursive` 工具函数（Rust `std::fs` 递归 copy）

---

## 方案二：已导入项目批量迁移

Settings 页加「项目文件整理」区域，提供一键迁移入口。

### 后端命令：`migrate_projects_to_app_dir`

1. 查询 DB 中 `output_dir` 不以 `state.projects_dir` 开头的所有项目
2. 逐个 copy 文件到 `state.projects_dir/{name}/`
3. copy 成功后 UPDATE DB `output_dir` 为新路径
4. 返回结果：`{ migrated: N, skipped: M, failed: [{ name, error }] }`

### 前端：Settings 页新增区域

```
项目文件整理
─────────────────────────────────────────────────
将所有不在应用目录中的历史项目文件复制到统一位置。
原目录文件不会被删除。

[迁移到应用目录]   ← 按钮

（完成后显示）已迁移 5 个项目 · 跳过 2 个（已在应用目录）
```

---

## 不做的事

- app 不删除原目录
- 不做单项目粒度迁移按钮
- 不修改 `projects_dir` 配置路径

---

## 受影响文件汇总

| 文件 | 变更 |
|------|------|
| `app/src-tauri/src/commands/projects.rs` | `import_legacy_projects` copy 行为 + `migrate_projects_to_app_dir` 新命令 |
| `app/src-tauri/src/lib.rs` | 注册新命令 |
| `app/src/lib/tauri-api.ts` | 新增 `migrateProjectsToAppDir` |
| `app/src/pages/Settings.tsx` | 新增「项目文件整理」区域 |
