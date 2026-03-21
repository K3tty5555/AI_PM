use serde::{Deserialize, Serialize};
use std::process::Command;
use std::fs;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncReadExt;
use crate::providers::claude_cli::enriched_path;

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
        check_python_pkg("python-docx", "python-docx", "python_docx", true, "PRD 导出 Word 文档"),
        check_python_pkg("Pillow",      "Pillow（图像处理）", "Pillow", false, "Word 文档中嵌入原型截图"),
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
                if plugins.keys().any(|k| k.to_lowercase().contains("playwright")) {
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
                if servers.keys().any(|k| k.to_lowercase().contains("playwright")) {
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
    let version = run_sync("python3", &["--version"])
        .map(|s| s.trim_start_matches("Python ").to_string());
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

fn check_python_pkg(name: &str, label: &str, pkg_import: &str, required: bool, feature_hint: &str) -> DepStatus {
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
        let _ = app.emit("install_done", serde_json::json!({ "ok": true, "dep": args.dep }));
        Ok(())
    } else {
        let msg = format!("{} 安装失败（exit {:?}）", args.dep, status.code());
        let _ = app.emit("install_progress", format!("✗ {}\n", msg));
        let _ = app.emit("install_done", serde_json::json!({ "ok": false, "dep": args.dep, "error": msg }));
        Err(msg)
    }
}

fn build_install_cmd(dep: &str, use_mirror: bool) -> Result<(String, Vec<String>), String> {
    match dep {
        "python-docx" | "Pillow" => {
            let mut args = vec![
                "-m".into(), "pip".into(), "install".into(), dep.into(),
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
                "install".into(), "-g".into(),
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
