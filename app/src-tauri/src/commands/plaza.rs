use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager};

use crate::providers::AiProvider;
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

// ── Plaza API Config ─────────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlazaApiConfigState {
    pub ark_api_key_masked: Option<String>,
    pub ark_api_key_source: String,
    pub minimax_api_key_masked: Option<String>,
    pub minimax_api_key_source: String,
    pub minimax_group_id_masked: Option<String>,
    pub minimax_group_id_source: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePlazaApiConfigArgs {
    pub ark_api_key: Option<String>,
    pub minimax_api_key: Option<String>,
    pub minimax_group_id: Option<String>,
}

fn mask_plaza_key(key: &str) -> String {
    if key.len() <= 8 {
        "****".into()
    } else {
        format!("{}****{}", &key[..4], &key[key.len() - 4..])
    }
}

fn read_plaza_key(env_var: &str) -> (Option<String>, String) {
    if let Ok(val) = std::env::var(env_var) {
        if !val.is_empty() {
            return (Some(val), "env".into());
        }
    }
    if let Some(home) = dirs::home_dir() {
        let env_file = home.join(".baoyu-skills/.env");
        if env_file.exists() {
            if let Ok(iter) = dotenvy::from_path_iter(&env_file) {
                for item in iter.flatten() {
                    if item.0 == env_var {
                        return (Some(item.1), "env_file".into());
                    }
                }
            }
        }
    }
    (None, "none".into())
}

#[tauri::command]
pub fn get_plaza_api_config() -> PlazaApiConfigState {
    let (ark_key, ark_source) = read_plaza_key("ARK_API_KEY");
    let (minimax_key, minimax_source) = read_plaza_key("MINIMAX_API_KEY");
    let (minimax_group, minimax_group_source) = read_plaza_key("MINIMAX_GROUP_ID");

    PlazaApiConfigState {
        ark_api_key_masked: ark_key.as_deref().map(mask_plaza_key),
        ark_api_key_source: ark_source,
        minimax_api_key_masked: minimax_key.as_deref().map(mask_plaza_key),
        minimax_api_key_source: minimax_source,
        minimax_group_id_masked: minimax_group.as_deref().map(mask_plaza_key),
        minimax_group_id_source: minimax_group_source,
    }
}

#[tauri::command]
pub fn save_plaza_api_config(args: SavePlazaApiConfigArgs) -> Result<(), String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let env_dir = home.join(".baoyu-skills");
    std::fs::create_dir_all(&env_dir).map_err(|e| e.to_string())?;
    let env_path = env_dir.join(".env");

    let existing = if env_path.exists() {
        std::fs::read_to_string(&env_path).unwrap_or_default()
    } else {
        String::new()
    };

    let mut env_map: HashMap<String, String> = HashMap::new();
    let mut key_order: Vec<String> = Vec::new();

    for line in existing.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            key_order.push(format!("\x00{}", line));
            continue;
        }
        if let Some((k, v)) = trimmed.split_once('=') {
            let k = k.trim().to_string();
            if !key_order.contains(&k) {
                key_order.push(k.clone());
            }
            env_map.insert(k, v.trim().trim_matches('"').to_string());
        }
    }

    let update_key = |env_map: &mut HashMap<String, String>, key_order: &mut Vec<String>, k: &str, v: &str| {
        if !key_order.contains(&k.to_string()) {
            key_order.push(k.to_string());
        }
        env_map.insert(k.to_string(), v.to_string());
    };

    if let Some(key) = &args.ark_api_key {
        if !key.is_empty() { update_key(&mut env_map, &mut key_order, "ARK_API_KEY", key); }
    }
    if let Some(key) = &args.minimax_api_key {
        if !key.is_empty() { update_key(&mut env_map, &mut key_order, "MINIMAX_API_KEY", key); }
    }
    if let Some(gid) = &args.minimax_group_id {
        if !gid.is_empty() { update_key(&mut env_map, &mut key_order, "MINIMAX_GROUP_ID", gid); }
    }

    let mut lines: Vec<String> = Vec::new();
    for key in &key_order {
        if key.starts_with('\x00') {
            lines.push(key[1..].to_string());
        } else if let Some(val) = env_map.get(key) {
            lines.push(format!("{}={}", key, val));
        }
    }
    let content = lines.join("\n") + "\n";

    let tmp = env_path.with_extension("tmp");
    std::fs::write(&tmp, content).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &env_path).map_err(|e| e.to_string())?;
    Ok(())
}
