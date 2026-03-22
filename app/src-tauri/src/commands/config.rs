use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::State;
use crate::state::AppState;

const DEFAULT_MODEL: &str = "claude-sonnet-4-6";

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Backend {
    Api,
    ClaudeCli,
}

impl Default for Backend {
    fn default() -> Self {
        Backend::Api
    }
}

/// 判断是否为 Anthropic 原生 API（否则走 OpenAI 兼容格式）
pub fn is_anthropic(base_url: &str, model: &str) -> bool {
    base_url.contains("anthropic.com")
        || model.starts_with("claude-")
        || base_url.is_empty()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClaudeConfig {
    #[serde(rename = "apiKey")]
    pub api_key: Option<String>,
    #[serde(rename = "baseUrl")]
    pub base_url: Option<String>,
    pub model: String,
    #[serde(default)]
    pub backend: Backend,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigState {
    pub has_config: bool,
    pub config_source: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model: String,
    pub backend: String,
}

fn get_config_path(config_dir: &str) -> String {
    format!("{}/config.json", config_dir)
}

pub fn read_config_internal(config_dir: &str) -> Option<ClaudeConfig> {
    // Tier 1: process environment variable (only for API mode)
    if let Ok(key) = std::env::var("ANTHROPIC_API_KEY") {
        if !key.is_empty() {
            return Some(ClaudeConfig {
                api_key: Some(key),
                base_url: std::env::var("ANTHROPIC_BASE_URL")
                    .ok()
                    .filter(|s| !s.is_empty()),
                model: std::env::var("ANTHROPIC_MODEL")
                    .ok()
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| DEFAULT_MODEL.to_string()),
                backend: Backend::Api,
            });
        }
    }

    // Tier 2: local config file at ~/.config/ai-pm/config.json
    let config_path = get_config_path(config_dir);
    if let Ok(raw) = fs::read_to_string(&config_path) {
        if let Ok(config) = serde_json::from_str::<ClaudeConfig>(&raw) {
            // CLI mode: no api_key needed
            if config.backend == Backend::ClaudeCli {
                return Some(config);
            }
            // API mode: requires api_key
            if config.api_key.as_ref().map(|k| !k.is_empty()).unwrap_or(false) {
                return Some(config);
            }
        }
    }

    None
}

fn mask_key(key: &str) -> String {
    let prefix: String = key.chars().take(8).collect();
    if prefix.chars().count() == 8 {
        format!("{}****", prefix)
    } else {
        "****".to_string()
    }
}

#[tauri::command]
pub fn get_config(state: State<AppState>) -> ConfigState {
    // Check env var
    if let Ok(key) = std::env::var("ANTHROPIC_API_KEY") {
        if !key.is_empty() {
            return ConfigState {
                has_config: true,
                config_source: "env".to_string(),
                api_key: Some(mask_key(&key)),
                base_url: std::env::var("ANTHROPIC_BASE_URL")
                    .ok()
                    .filter(|s| !s.is_empty()),
                model: std::env::var("ANTHROPIC_MODEL")
                    .ok()
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| DEFAULT_MODEL.to_string()),
                backend: "api".to_string(),
            };
        }
    }

    // Check local config file
    let config_path = get_config_path(&state.config_dir);
    if let Ok(raw) = fs::read_to_string(&config_path) {
        if let Ok(config) = serde_json::from_str::<ClaudeConfig>(&raw) {
            let backend_str = if config.backend == Backend::ClaudeCli {
                "claude_cli".to_string()
            } else {
                "api".to_string()
            };

            // CLI mode: always has_config
            if config.backend == Backend::ClaudeCli {
                return ConfigState {
                    has_config: true,
                    config_source: "local".to_string(),
                    api_key: config.api_key.as_deref().map(mask_key),
                    base_url: config.base_url,
                    model: config.model,
                    backend: backend_str,
                };
            }

            // API mode: need api_key
            if let Some(key) = &config.api_key {
                if !key.is_empty() {
                    return ConfigState {
                        has_config: true,
                        config_source: "local".to_string(),
                        api_key: Some(mask_key(key)),
                        base_url: config.base_url,
                        model: config.model,
                        backend: backend_str,
                    };
                }
            }
        }
    }

    ConfigState {
        has_config: false,
        config_source: "none".to_string(),
        api_key: None,
        base_url: None,
        model: DEFAULT_MODEL.to_string(),
        backend: "api".to_string(),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveConfigArgs {
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub backend: Option<String>,
}

#[tauri::command]
pub fn save_config(
    state: State<AppState>,
    args: SaveConfigArgs,
) -> Result<serde_json::Value, String> {
    let config_path = get_config_path(&state.config_dir);

    // Read existing config
    let mut existing = if let Ok(raw) = fs::read_to_string(&config_path) {
        serde_json::from_str::<serde_json::Value>(&raw).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    // Merge new values
    if let Some(key) = args.api_key {
        if !key.is_empty() {
            existing["apiKey"] = serde_json::Value::String(key);
        }
    }
    if let Some(url) = args.base_url {
        if !url.is_empty() {
            existing["baseUrl"] = serde_json::Value::String(url);
        }
    }
    if let Some(model) = args.model {
        if !model.is_empty() {
            existing["model"] = serde_json::Value::String(model);
        }
    }
    if let Some(backend) = args.backend {
        if !backend.is_empty() {
            existing["backend"] = serde_json::Value::String(backend);
        }
    }

    // Write back
    fs::create_dir_all(Path::new(&config_path).parent().ok_or("无效的配置路径".to_string())?)
        .map_err(|e| e.to_string())?;
    fs::write(
        &config_path,
        serde_json::to_string_pretty(&existing).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({ "ok": true }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestConfigArgs {
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model: Option<String>,
}

#[tauri::command]
pub async fn test_config(
    state: State<'_, AppState>,
    args: TestConfigArgs,
) -> Result<serde_json::Value, String> {
    // Determine credentials to test (args override stored config)
    let stored = read_config_internal(&state.config_dir);

    let api_key = args
        .api_key
        .filter(|k| !k.is_empty())
        .or_else(|| stored.as_ref().and_then(|c| c.api_key.clone()))
        .ok_or_else(|| "No API key configured".to_string())?;

    let base_url = args
        .base_url
        .filter(|u| !u.is_empty())
        .or_else(|| stored.as_ref().and_then(|c| c.base_url.clone()))
        .unwrap_or_else(|| "https://api.anthropic.com".to_string());

    let model = args
        .model
        .filter(|m| !m.is_empty())
        .unwrap_or_else(|| DEFAULT_MODEL.to_string());

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))?;
    let anthropic = is_anthropic(&base_url, &model);

    let resp = if anthropic {
        let url = format!("{}/v1/messages", base_url.trim_end_matches('/'));
        client
            .post(&url)
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&serde_json::json!({
                "model": &model,
                "max_tokens": 10,
                "messages": [{"role": "user", "content": "Hi"}]
            }))
            .send()
            .await
            .map_err(|e| e.to_string())?
    } else {
        // OpenAI 兼容格式（Kimi、OpenAI 等）
        let url = format!("{}/v1/chat/completions", base_url.trim_end_matches('/'));
        client
            .post(&url)
            .header("Authorization", format!("Bearer {}", &api_key))
            .header("content-type", "application/json")
            .json(&serde_json::json!({
                "model": &model,
                "max_tokens": 10,
                "messages": [{"role": "user", "content": "Hi"}]
            }))
            .send()
            .await
            .map_err(|e| e.to_string())?
    };

    if resp.status().is_success() {
        Ok(serde_json::json!({ "ok": true, "model": model }))
    } else {
        let err_body = resp.text().await.unwrap_or_default();
        Ok(serde_json::json!({ "ok": false, "error": err_body }))
    }
}

#[tauri::command]
pub fn get_projects_dir(state: State<AppState>) -> String {
    state.projects_dir.clone()
}

#[tauri::command]
pub fn save_projects_dir(
    state: State<AppState>,
    path: String,
) -> Result<serde_json::Value, String> {
    let config_path = get_config_path(&state.config_dir);

    let mut existing = if let Ok(raw) = fs::read_to_string(&config_path) {
        serde_json::from_str::<serde_json::Value>(&raw).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    existing["projectsDir"] = serde_json::Value::String(path.clone());

    fs::create_dir_all(Path::new(&config_path).parent().ok_or("无效的配置路径".to_string())?)
        .map_err(|e| e.to_string())?;
    fs::write(
        &config_path,
        serde_json::to_string_pretty(&existing).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    // Also create the directory if it doesn't exist
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub async fn test_cli_config() -> Result<serde_json::Value, String> {
    match crate::providers::claude_cli::ClaudeCliProvider::check_available().await {
        Ok(version) => Ok(serde_json::json!({ "ok": true, "version": version })),
        Err(msg) => Ok(serde_json::json!({ "ok": false, "error": msg })),
    }
}
