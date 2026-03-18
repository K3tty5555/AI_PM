# 目录结构分层重构设计文档

**日期：** 2026-03-19
**背景：** 当前 Tauri App 的 `projectsDir` 内项目文件与模板配置平铺在同一层，语义混乱，且与 Claude Code skill 版的分层约定不一致。用户调整 `projectsDir` 时会导致模板"消失"（今天的 bug）。

---

## 目标

在 `projectsDir` 内增加 `projects/` 和 `templates/` 两个子目录，对齐 CLI 版规范：

```
{projectsDir}/
├── projects/              ← 所有项目文件
│   ├── {项目名}/
│   └── ...
└── templates/             ← 所有模板配置
    ├── knowledge-base/
    ├── prd-styles/
    └── ui-specs/
```

---

## 不做的事

- 不改 `projectsDir` 本身的配置方式（用户仍可在设置里自由指定）
- 不改 `config_dir`（`~/.config/ai-pm/`）的内容
- 不改 CLI 版（`.claude/skills/ai-pm/`）任何文件

---

## 受影响的后端路径

| 现在 | 改后 |
|------|------|
| `{projectsDir}/{name}/` | `{projectsDir}/projects/{name}/` |
| `{projectsDir}/knowledge-base/` | `{projectsDir}/templates/knowledge-base/` |
| `{projectsDir}/prd-styles/` | `{projectsDir}/templates/prd-styles/` |
| `{projectsDir}/ui-specs/` | `{projectsDir}/templates/ui-specs/` |

涉及文件：`commands/projects.rs`（3 处）、`commands/templates.rs`（12 处）、`commands/knowledge.rs`（4 处）

---

## 方案：AppState 加两个辅助方法

在 `state.rs` 的 `AppState` 上加：

```rust
impl AppState {
    pub fn projects_base(&self) -> std::path::PathBuf {
        std::path::Path::new(&self.projects_dir).join("projects")
    }
    pub fn templates_base(&self) -> std::path::PathBuf {
        std::path::Path::new(&self.projects_dir).join("templates")
    }
}
```

所有命令用 `state.projects_base()` / `state.templates_base()` 替换原来的直接路径拼接。`load_active_prd_style` 接收 `projects_dir: &str`，改为接收 `templates_base: &std::path::Path`（或在调用方传入 `state.templates_base()`）。

---

## DB 启动自动迁移

**触发条件：** App 启动时，检测 DB 中是否存在 `output_dir` 在 `{projects_dir}/` 下但不在 `{projects_dir}/projects/` 下的行。

**迁移逻辑（在 `lib.rs` 的 `run()` 里，`init_db` 之后执行）：**

1. 查询所有 `output_dir` 以 `projects_dir + "/"` 开头、但不以 `projects_dir + "/projects/"` 开头的项目
2. 对每个项目：
   - 计算新路径：将 `{projects_dir}/` 后的部分改为 `projects/{name}/`（即原 `output_dir` 末尾的目录名）
   - 如果旧路径磁盘文件存在：移动到新路径（`fs::rename`，失败则跳过）
   - UPDATE DB `output_dir` 为新路径
3. 迁移完成后写 `config_dir/migrated_v2` 标记文件，避免重复运行

**注意：** `fs::rename` 在同一文件系统内是原子操作，不同分区需 copy+delete fallback。

---

## dev 环境实际目录迁移

`projectsDir = /Users/xiaowu/Documents/AI PM/`

迁移前：
```
AI PM/
├── output/           ← 旧 projectsDir 时留下的项目文件
│   ├── ai辅批助手/
│   ├── web端考试阅卷/
│   ├── 分层班行政班/
│   ├── 教学监管/
│   ├── 新版考试答题卡/
│   ├── knowledge-base/   ← 今天手动复制的多余副本
│   ├── prd-styles/
│   └── ui-specs/
├── knowledge-base/   ← 模板原始位置
├── prd-styles/
└── ui-specs/
```

迁移后：
```
AI PM/
├── projects/
│   ├── ai辅批助手/
│   ├── web端考试阅卷/
│   ├── 分层班行政班/
│   ├── 教学监管/
│   └── 新版考试答题卡/
└── templates/
    ├── knowledge-base/
    ├── prd-styles/
    └── ui-specs/
```

`output/` 目录整体删除（项目已移出，模板副本也删除）。

---

## 受影响文件汇总

| 文件 | 变更 |
|------|------|
| `app/src-tauri/src/state.rs` | 新增 `projects_base()` / `templates_base()` impl |
| `app/src-tauri/src/commands/projects.rs` | 3 处路径改用 `state.projects_base()` |
| `app/src-tauri/src/commands/templates.rs` | 12 处路径改用 `state.templates_base()`；`load_active_prd_style` 签名调整 |
| `app/src-tauri/src/commands/knowledge.rs` | 4 处路径改用 `state.templates_base()` |
| `app/src-tauri/src/lib.rs` | 启动时执行 DB + 物理文件一次性迁移 |
