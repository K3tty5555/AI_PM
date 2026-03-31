use serde::Deserialize;
use std::path::Path;
use tauri::{AppHandle, Emitter};

use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunPlazaSkillArgs {
    pub skill_id: String,
    pub user_input: String,
}

/// Some plaza skills share a single underlying CLI skill name.
fn resolve_cli_skill_name(skill_id: &str) -> &str {
    match skill_id {
        "minimax-multimodal-image"
        | "minimax-multimodal-video"
        | "minimax-multimodal-audio" => "minimax-multimodal-toolkit",
        other => other,
    }
}

/// Load plaza-manifest.json from bundled resources.
/// Tries production resource_dir first, then dev fallback paths.
#[tauri::command]
pub fn load_plaza_manifest(app: AppHandle) -> Result<serde_json::Value, String> {
    let base = app
        .path()
        .resource_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));

    let candidates = [
        base.join("plaza-manifest.json"),
        base.join("resources").join("plaza-manifest.json"),
        std::path::PathBuf::from("src-tauri/resources/plaza-manifest.json"),
    ];

    for path in &candidates {
        if path.exists() {
            let content = std::fs::read_to_string(path)
                .map_err(|e| format!("读取 plaza-manifest.json 失败: {e}"))?;
            return serde_json::from_str(&content)
                .map_err(|e| format!("解析 manifest 失败: {e}"));
        }
    }

    Err("plaza-manifest.json 未找到".to_string())
}

/// Load a plaza skill's SKILL.md from user's ~/.claude installation.
/// Mirrors stream::load_user_companion — tries user skills dir, then plugin cache.
fn load_plaza_skill_content(skill_name: &str) -> Option<String> {
    let home = dirs::home_dir()?;

    // 1. User skills dir: ~/.claude/skills/{skill_name}/SKILL.md
    let skill_path = home
        .join(".claude/skills")
        .join(skill_name)
        .join("SKILL.md");
    if skill_path.exists() {
        return std::fs::read_to_string(&skill_path).ok();
    }

    // 2. Plugin cache: ~/.claude/plugins/installed_plugins.json
    let plugins_json = home.join(".claude/plugins/installed_plugins.json");
    if let Ok(raw) = std::fs::read_to_string(&plugins_json) {
        if let Ok(cfg) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(plugins) = cfg.get("plugins").and_then(|v| v.as_object()) {
                for (key, entries) in plugins {
                    // key format: "skill-name@plugin-provider"
                    let plugin_short = key.split('@').next().unwrap_or("");
                    if plugin_short.eq_ignore_ascii_case(skill_name) {
                        if let Some(first) = entries.as_array().and_then(|a| a.first()) {
                            if let Some(install_path) =
                                first.get("installPath").and_then(|v| v.as_str())
                            {
                                let md = Path::new(install_path).join("SKILL.md");
                                if let Ok(content) = std::fs::read_to_string(&md) {
                                    return Some(content);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    None
}

/// Run a plaza skill via ClaudeCliProvider.
/// skill_id is validated against plaza-manifest.json at runtime.
/// user_input is passed as a separate message to avoid prompt injection.
#[tauri::command]
pub async fn run_plaza_skill(
    app: AppHandle,
    _state: tauri::State<'_, AppState>,
    args: RunPlazaSkillArgs,
) -> Result<(), String> {
    let stream_key = format!("plaza:{}", args.skill_id);

    // Security: validate skill_id against manifest (dynamic allowlist)
    {
        let manifest = load_plaza_manifest(app.clone())?;
        let valid_ids: Vec<&str> = manifest["skills"]
            .as_array()
            .ok_or("manifest.skills 格式错误")?
            .iter()
            .filter_map(|s| s["id"].as_str())
            .collect();

        if !valid_ids.contains(&args.skill_id.as_str()) {
            return Err(format!("未知 plaza skill: {}", args.skill_id));
        }
    }

    let cli_skill_name = resolve_cli_skill_name(&args.skill_id);

    // Load skill content as system prompt from user's ~/.claude
    let system_prompt = load_plaza_skill_content(cli_skill_name).unwrap_or_else(|| {
        format!(
            "你是 AI PM 助手，请使用 {} 技能完成用户请求。",
            cli_skill_name
        )
    });

    // Single user message — ClaudeCliProvider uses the last user message
    let messages = vec![crate::commands::stream::ChatMessage {
        role: "user".to_string(),
        content: args.user_input.clone(),
    }];

    // Use home dir as work_dir (plaza skills are not project-specific)
    let work_dir = dirs::home_dir()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|| ".".to_string());

    let provider = crate::providers::claude_cli::ClaudeCliProvider { work_dir };

    match provider
        .stream(&system_prompt, &messages, &app, &stream_key)
        .await
    {
        Ok(_) => Ok(()),
        Err(e) => {
            let _ = app.emit(
                "stream_error",
                serde_json::json!({ "streamKey": &stream_key, "message": &e }),
            );
            Err(e)
        }
    }
}
