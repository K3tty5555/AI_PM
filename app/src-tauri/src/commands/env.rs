use crate::providers::claude_cli::enriched_path;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncReadExt;

// ── Dependency descriptors ───────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DepStatus {
    /// Internal key used by install_dep
    pub name: String,
    /// Human-readable label
    pub label: String,
    pub installed: bool,
    pub version: Option<String>,
    /// false = optional (nicer UI treatment)
    pub required: bool,
    /// true = we can auto-install it; false = user must install manually
    pub auto_installable: bool,
    /// Shown when not installed and not auto-installable
    pub manual_hint: Option<String>,
    /// Which app features are affected when not installed
    pub feature_hint: String,
}

// ── check_env ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn check_env() -> Vec<DepStatus> {
    vec![
        check_python3(),
        check_python_pkg(
            "python-docx",
            "python-docx",
            "python_docx",
            true,
            "PRD 导出 Word 文档",
        ),
        check_python_pkg(
            "Pillow",
            "Pillow（图像处理）",
            "Pillow",
            false,
            "Word 文档中嵌入原型截图",
        ),
        check_python_pkg(
            "python-pptx",
            "python-pptx",
            "pptx",
            true,
            "PRD 导出 PPT 演示文稿",
        ),
        check_python_pkg(
            "markitdown",
            "markitdown（PPT 验证）",
            "markitdown",
            false,
            "PPT 生成后内容完整性验证",
        ),
        check_claude_cli(),
        check_playwright_mcp_dep(),
    ]
}

// ── check_playwright_mcp ─────────────────────────────────────────────────────

/// Lightweight command: just reads ~/.claude.json, no subprocess.
#[tauri::command]
pub fn check_playwright_mcp() -> bool {
    detect_playwright_mcp()
}

fn detect_playwright_mcp() -> bool {
    let home = dirs::home_dir().unwrap_or_default();

    // Method 1: Claude Code plugin system (~/.claude/plugins/installed_plugins.json)
    let plugins_json = home.join(".claude/plugins/installed_plugins.json");
    if let Ok(raw) = fs::read_to_string(&plugins_json) {
        if let Ok(cfg) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(plugins) = cfg.get("plugins").and_then(|v| v.as_object()) {
                if plugins
                    .keys()
                    .any(|k| k.to_lowercase().contains("playwright"))
                {
                    return true;
                }
            }
        }
    }

    // Method 2: Traditional mcpServers in ~/.claude.json
    let claude_json = home.join(".claude.json");
    if let Ok(raw) = fs::read_to_string(&claude_json) {
        if let Ok(cfg) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(servers) = cfg.get("mcpServers").and_then(|v| v.as_object()) {
                if servers
                    .keys()
                    .any(|k| k.to_lowercase().contains("playwright"))
                {
                    return true;
                }
            }
        }
    }

    false
}

fn check_playwright_mcp_dep() -> DepStatus {
    let installed = detect_playwright_mcp();
    let npm_ok = run_sync("npm", &["--version"]).is_some();
    let cli_ok = run_sync("claude", &["--version"]).is_some();
    DepStatus {
        name: "playwright-mcp".into(),
        label: "Playwright MCP".into(),
        installed,
        version: None,
        required: false,
        auto_installable: false,
        manual_hint: if !cli_ok {
            Some("需要先安装 Claude Code CLI".into())
        } else if !npm_ok {
            Some("需要先安装 Node.js：https://nodejs.org/".into())
        } else {
            Some("运行：claude mcp add playwright -s user -- npx @playwright/mcp@latest".into())
        },
        feature_hint: "竞品深度分析（自动登录截图）".into(),
    }
}

fn check_python3() -> DepStatus {
    let version =
        run_sync("python3", &["--version"]).map(|s| s.trim_start_matches("Python ").to_string());
    DepStatus {
        name: "python3".into(),
        label: "Python 3".into(),
        installed: version.is_some(),
        version,
        required: true,
        auto_installable: false,
        manual_hint: Some("请访问 https://www.python.org/downloads/ 安装".into()),
        feature_hint: "PRD 导出 Word 文档、数据分析".into(),
    }
}

fn check_python_pkg(
    name: &str,
    label: &str,
    pkg_import: &str,
    required: bool,
    feature_hint: &str,
) -> DepStatus {
    let script = format!(
        "import importlib.metadata; print(importlib.metadata.version('{}'))",
        pkg_import
    );
    let version = run_sync("python3", &["-c", &script]);
    DepStatus {
        name: name.into(),
        label: label.into(),
        installed: version.is_some(),
        version,
        required,
        auto_installable: true,
        manual_hint: None,
        feature_hint: feature_hint.into(),
    }
}

fn check_claude_cli() -> DepStatus {
    let version = run_sync("claude", &["--version"]);
    // Check if npm is available (prerequisite)
    let npm_ok = run_sync("npm", &["--version"]).is_some();
    DepStatus {
        name: "claude-cli".into(),
        label: "Claude Code CLI".into(),
        installed: version.is_some(),
        version,
        required: false,
        auto_installable: npm_ok,
        manual_hint: if !npm_ok {
            Some("需要先安装 Node.js：https://nodejs.org/".into())
        } else {
            None
        },
        feature_hint: "CLI 模式：联网搜索、Excel 读取、多 Agent 并行".into(),
    }
}

/// Run a command synchronously, return trimmed stdout on success.
fn run_sync(cmd: &str, args: &[&str]) -> Option<String> {
    Command::new(cmd)
        .args(args)
        .env("PATH", enriched_path())
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| {
            let out = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if out.is_empty() {
                String::from_utf8_lossy(&o.stderr).trim().to_string()
            } else {
                out
            }
        })
        .filter(|s| !s.is_empty())
}

// ── run_diagnostics ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticItem {
    pub name: String,
    pub category: String,
    pub status: String,
    pub message: String,
    pub fix_hint: Option<String>,
    pub auto_installable: bool,
    pub duration_ms: u64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticSummary {
    pub total: u32,
    pub passed: u32,
    pub warnings: u32,
    pub errors: u32,
}

fn dep_to_diagnostic(dep: &DepStatus) -> DiagnosticItem {
    DiagnosticItem {
        name: dep.label.clone(),
        category: "dependency".to_string(),
        status: if dep.installed {
            "ok"
        } else if dep.required {
            "error"
        } else {
            "warning"
        }
        .to_string(),
        message: dep.version.clone().unwrap_or_else(|| {
            if dep.installed {
                "已安装".to_string()
            } else {
                "未安装".to_string()
            }
        }),
        fix_hint: dep.manual_hint.clone(),
        auto_installable: dep.auto_installable,
        duration_ms: 0,
    }
}

fn diagnostic_item(
    name: &str,
    category: &str,
    status: &str,
    message: String,
    fix_hint: Option<String>,
) -> DiagnosticItem {
    DiagnosticItem {
        name: name.to_string(),
        category: category.to_string(),
        status: status.to_string(),
        message,
        fix_hint,
        auto_installable: false,
        duration_ms: 0,
    }
}

fn emit_diagnostic(
    app: &AppHandle,
    item: DiagnosticItem,
    total: &mut u32,
    passed: &mut u32,
    warnings: &mut u32,
    errors: &mut u32,
) {
    *total += 1;
    match item.status.as_str() {
        "ok" => *passed += 1,
        "warning" => *warnings += 1,
        _ => *errors += 1,
    }
    let _ = app.emit("diagnostic_item", &item);
}

fn bundled_skills_dir(app: &AppHandle) -> Option<PathBuf> {
    let base = app.path().resource_dir().ok()?;
    let primary = base.join("resources/skills");
    if primary.is_dir() {
        return Some(primary);
    }
    let fallback = base.join("skills");
    if fallback.is_dir() {
        return Some(fallback);
    }
    None
}

fn find_repo_skills_dir() -> Option<PathBuf> {
    let cwd = std::env::current_dir().ok()?;
    for ancestor in cwd.ancestors() {
        let candidate = ancestor.join(".claude/skills");
        if candidate.is_dir() {
            return Some(candidate);
        }
    }
    None
}

fn skill_exists(root: &Path, skill: &str) -> bool {
    root.join(skill).join("SKILL.md").is_file()
}

fn collect_skill_names(root: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(root)
        .map(|rd| {
            rd.filter_map(|e| e.ok())
                .filter(|e| e.path().join("SKILL.md").is_file())
                .map(|e| e.file_name().to_string_lossy().to_string())
                .collect()
        })
        .unwrap_or_default();
    names.sort();
    names
}

fn ai_context_diagnostics(app: &AppHandle) -> Vec<DiagnosticItem> {
    const REQUIRED_SKILLS: &[&str] = &[
        "ai-pm",
        "ai-pm-analyze",
        "ai-pm-brainstorm",
        "ai-pm-data",
        "ai-pm-design-spec",
        "ai-pm-driver",
        "ai-pm-interview",
        "ai-pm-knowledge",
        "ai-pm-persona",
        "ai-pm-prd",
        "ai-pm-priority",
        "ai-pm-prototype",
        "ai-pm-research",
        "ai-pm-retrospective",
        "ai-pm-review",
        "ai-pm-review-modify",
        "ai-pm-story",
        "ai-pm-weekly",
        "Humanizer-zh",
        "frontend-design",
        "ui-ux-pro-max",
    ];

    let mut items = Vec::new();

    if let Some(root) = bundled_skills_dir(app) {
        let missing: Vec<&str> = REQUIRED_SKILLS
            .iter()
            .copied()
            .filter(|skill| !skill_exists(&root, skill))
            .collect();
        if missing.is_empty() {
            items.push(diagnostic_item(
                "客户端内置 Skills",
                "ai_context",
                "ok",
                format!("{} 个必需 skill 已就绪", REQUIRED_SKILLS.len()),
                None,
            ));
        } else {
            items.push(diagnostic_item(
                "客户端内置 Skills",
                "ai_context",
                "error",
                format!("缺少 {}", missing.join("、")),
                Some("重新构建客户端，确认 .claude/skills 中包含这些 skill".to_string()),
            ));
        }
    } else {
        items.push(diagnostic_item(
            "客户端内置 Skills",
            "ai_context",
            "error",
            "未找到打包 skills 目录".to_string(),
            Some("检查 app/src-tauri/tauri.conf.json resources 配置".to_string()),
        ));
    }

    if let Some(source_root) = find_repo_skills_dir() {
        let missing_source: Vec<&str> = REQUIRED_SKILLS
            .iter()
            .copied()
            .filter(|skill| !skill_exists(&source_root, skill))
            .collect();
        if missing_source.is_empty() {
            items.push(diagnostic_item(
                "Claude Skills 主源",
                "ai_context",
                "ok",
                format!(
                    "{} 个客户端依赖 skill 均在 .claude/skills 主源中",
                    REQUIRED_SKILLS.len()
                ),
                None,
            ));
        } else {
            items.push(diagnostic_item(
                "Claude Skills 主源",
                "ai_context",
                "error",
                format!(".claude/skills 缺少 {}", missing_source.join("、")),
                Some("将客户端依赖的 skill 补回 .claude/skills，避免打包时丢失".to_string()),
            ));
        }

        if let Some(resource_root) = bundled_skills_dir(app) {
            let source_names = collect_skill_names(&source_root);
            let resource_names = collect_skill_names(&resource_root);
            let resource_only: Vec<String> = resource_names
                .iter()
                .filter(|name| !source_names.contains(name))
                .cloned()
                .collect();
            if resource_only.is_empty() {
                items.push(diagnostic_item(
                    "Skills 漂移检查",
                    "ai_context",
                    "ok",
                    "resources/skills 未发现主源外残留 skill".to_string(),
                    None,
                ));
            } else {
                items.push(diagnostic_item(
                    "Skills 漂移检查",
                    "ai_context",
                    "warning",
                    format!(
                        "resources/skills 仍有主源外残留：{}",
                        resource_only.join("、")
                    ),
                    Some("以 .claude/skills 为主源，同步或删除资源目录残留".to_string()),
                ));
            }
        }
    } else {
        items.push(diagnostic_item(
            "Claude Skills 主源",
            "ai_context",
            "warning",
            "当前运行环境无法定位仓库 .claude/skills，只检查内置资源".to_string(),
            None,
        ));
    }

    items
}

fn instinct_diagnostics() -> Vec<DiagnosticItem> {
    let mut items = Vec::new();
    let base = crate::commands::instincts::instincts_dir();
    if !base.exists() {
        items.push(diagnostic_item(
            "Instinct 存储",
            "ai_context",
            "warning",
            "尚未创建 ~/.config/ai-pm/instincts，首次沉淀习惯时会自动创建".to_string(),
            None,
        ));
        return items;
    }

    let mut missing = Vec::new();
    for subdir in &["writing", "workflow", "archived"] {
        if !base.join(subdir).is_dir() {
            missing.push(*subdir);
        }
    }
    if missing.is_empty() {
        items.push(diagnostic_item(
            "Instinct 存储",
            "ai_context",
            "ok",
            "习惯直觉目录结构正常".to_string(),
            None,
        ));
    } else {
        items.push(diagnostic_item(
            "Instinct 存储",
            "ai_context",
            "warning",
            format!("缺少子目录：{}", missing.join("、")),
            Some("进入「我的习惯」或从 PM 体检沉淀习惯后会自动补齐".to_string()),
        ));
    }

    items
}

#[tauri::command]
pub async fn run_diagnostics(app: AppHandle, detailed: bool) -> Result<(), String> {
    let mut total = 0u32;
    let mut passed = 0u32;
    let mut warnings = 0u32;
    let mut errors = 0u32;

    // Basic dependency checks — reuse existing helpers
    let deps = vec![
        check_python3(),
        check_python_pkg(
            "python-docx",
            "python-docx",
            "python_docx",
            true,
            "PRD 导出 Word 文档",
        ),
        check_python_pkg(
            "Pillow",
            "Pillow（图像处理）",
            "Pillow",
            false,
            "Word 文档中嵌入原型截图",
        ),
        check_claude_cli(),
        check_playwright_mcp_dep(),
    ];

    for dep in &deps {
        emit_diagnostic(
            &app,
            dep_to_diagnostic(dep),
            &mut total,
            &mut passed,
            &mut warnings,
            &mut errors,
        );
    }

    if detailed {
        // Disk space check (placeholder — always passes for now)
        let disk_item = DiagnosticItem {
            name: "磁盘空间".to_string(),
            category: "local".to_string(),
            status: "ok".to_string(),
            message: "检查通过".to_string(),
            fix_hint: None,
            auto_installable: false,
            duration_ms: 0,
        };
        emit_diagnostic(
            &app,
            disk_item,
            &mut total,
            &mut passed,
            &mut warnings,
            &mut errors,
        );

        for item in ai_context_diagnostics(&app) {
            emit_diagnostic(
                &app,
                item,
                &mut total,
                &mut passed,
                &mut warnings,
                &mut errors,
            );
        }
        for item in instinct_diagnostics() {
            emit_diagnostic(
                &app,
                item,
                &mut total,
                &mut passed,
                &mut warnings,
                &mut errors,
            );
        }

        // More deep checks can be added here later...
    }

    let summary = DiagnosticSummary {
        total,
        passed,
        warnings,
        errors,
    };
    let _ = app.emit("diagnostic_done", &summary);
    Ok(())
}

#[tauri::command]
pub async fn cancel_diagnostics() -> Result<(), String> {
    // TODO: implement cancellation logic
    Ok(())
}

// ── install_dep ──────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallDepArgs {
    pub dep: String,
    pub use_mirror: bool,
}

#[tauri::command]
pub async fn install_dep(app: AppHandle, args: InstallDepArgs) -> Result<(), String> {
    let (program, cmd_args) = build_install_cmd(&args.dep, args.use_mirror)?;

    let _ = app.emit("install_progress", format!("▶ 安装 {}...\n", args.dep));

    let mut child = tokio::process::Command::new(&program)
        .args(&cmd_args)
        .env("PATH", enriched_path())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| {
            let msg = format!("无法启动安装命令 `{}`：{}", program, e);
            let _ = app.emit("install_progress", format!("✗ {}\n", msg));
            msg
        })?;

    // Stream stdout in real time
    if let Some(mut stdout) = child.stdout.take() {
        let app2 = app.clone();
        tokio::spawn(async move {
            let mut buf = vec![0u8; 512];
            loop {
                match stdout.read(&mut buf).await {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app2.emit("install_progress", &chunk);
                    }
                }
            }
        });
    }

    // Stream stderr in real time
    if let Some(mut stderr) = child.stderr.take() {
        let app3 = app.clone();
        tokio::spawn(async move {
            let mut buf = vec![0u8; 512];
            loop {
                match stderr.read(&mut buf).await {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app3.emit("install_progress", &chunk);
                    }
                }
            }
        });
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;

    if status.success() {
        let _ = app.emit("install_progress", format!("✓ {} 安装完成\n", args.dep));
        let _ = app.emit(
            "install_done",
            serde_json::json!({ "ok": true, "dep": args.dep }),
        );
        Ok(())
    } else {
        let msg = format!("{} 安装失败（exit {:?}）", args.dep, status.code());
        let _ = app.emit("install_progress", format!("✗ {}\n", msg));
        let _ = app.emit(
            "install_done",
            serde_json::json!({ "ok": false, "dep": args.dep, "error": msg }),
        );
        Err(msg)
    }
}

fn build_install_cmd(dep: &str, use_mirror: bool) -> Result<(String, Vec<String>), String> {
    match dep {
        "python-docx" | "Pillow" => {
            let mut args = vec![
                "-m".into(),
                "pip".into(),
                "install".into(),
                dep.into(),
                "--quiet".into(),
            ];
            if use_mirror {
                args.push("-i".into());
                args.push("https://pypi.tuna.tsinghua.edu.cn/simple".into());
                args.push("--trusted-host".into());
                args.push("pypi.tuna.tsinghua.edu.cn".into());
            }
            Ok(("python3".into(), args))
        }
        "claude-cli" => {
            let mut args = vec![
                "install".into(),
                "-g".into(),
                "@anthropic-ai/claude-code".into(),
            ];
            if use_mirror {
                args.push("--registry".into());
                args.push("https://registry.npmmirror.com".into());
            }
            Ok(("npm".into(), args))
        }
        _ => Err(format!("不支持自动安装：{}", dep)),
    }
}
