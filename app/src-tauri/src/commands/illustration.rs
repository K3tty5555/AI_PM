use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::state::AppState;

// ── Data Structures ──────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateIllustrationArgs {
    pub prompt: String,
    pub style_preset: Option<String>,
    pub layout: Option<String>,
    pub size: Option<String>,
    pub project_dir: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IllustrationResult {
    pub file_path: String,
    pub thumb_path: String,
    pub width: u32,
    pub height: u32,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IllustrationEntry {
    pub file_path: String,
    pub thumb_path: String,
    pub file_name: String,
    pub prompt: String,
    pub created_at: String,
    pub size_bytes: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListIllustrationsArgs {
    pub project_dir: Option<String>,
    pub offset: Option<usize>,
    pub limit: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IllustrationConfigState {
    pub provider: String,
    pub model: String,
    pub api_key_masked: Option<String>,
    pub api_key_source: String,
    pub default_size: String,
    pub available_providers: Vec<ProviderDef>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDef {
    pub id: String,
    pub name: String,
    pub models: Vec<ModelDef>,
    pub sizes: Vec<String>,
    pub env_key_name: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModelDef {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveIllustrationConfigArgs {
    pub provider: String,
    pub model: String,
    pub api_key: Option<String>,
    pub default_size: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestKeyResult {
    pub valid: bool,
    pub message: String,
    pub cost_warning: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IllustrationMeta {
    pub version: u32,
    pub prompt: String,
    pub style: String,
    pub layout: String,
    pub provider: String,
    pub model: String,
    pub size: String,
    pub created_at: String,
}

// ── Provider Registry ────────────────────────────────────────────

pub fn get_providers() -> Vec<ProviderDef> {
    vec![ProviderDef {
        id: "seedream".into(),
        name: "Seedream (火山引擎)".into(),
        models: vec![ModelDef {
            id: "doubao-seedream-4-5-251128".into(),
            name: "Seedream 4.5".into(),
        }],
        sizes: vec![
            "2560x1440".into(),
            "1920x1080".into(),
            "1440x900".into(),
            "1024x1024".into(),
        ],
        env_key_name: "ARK_API_KEY".into(),
    }]
}

// ── API Key Resolution ───────────────────────────────────────────

fn mask_key(key: &str) -> String {
    if key.len() <= 8 {
        "****".into()
    } else {
        format!("{}****{}", &key[..4], &key[key.len() - 4..])
    }
}

pub fn load_api_key(provider: &ProviderDef, config_dir: &str) -> (Option<String>, String) {
    // Priority 1: environment variable
    if let Ok(val) = std::env::var(&provider.env_key_name) {
        if !val.is_empty() {
            return (Some(val), "env".into());
        }
    }

    // Priority 2: ~/.baoyu-skills/.env
    if let Some(home) = dirs::home_dir() {
        let env_file = home.join(".baoyu-skills/.env");
        if env_file.exists() {
            if let Ok(iter) = dotenvy::from_path_iter(&env_file) {
                for item in iter.flatten() {
                    if item.0 == provider.env_key_name {
                        return (Some(item.1), "env_file".into());
                    }
                }
            }
        }
    }

    // Priority 3: config.json
    let config_path = Path::new(config_dir).join("config.json");
    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(key) = json.get("illustrationApiKey").and_then(|v| v.as_str()) {
                    if !key.is_empty() {
                        return (Some(key.to_string()), "config".into());
                    }
                }
            }
        }
    }

    (None, "none".into())
}

// Helper to read saved illustration config from config.json
fn read_saved_config(config_dir: &str) -> (String, String, String) {
    let config_path = Path::new(config_dir).join("config.json");
    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                return (
                    json.get("illustrationProvider").and_then(|v| v.as_str()).unwrap_or("seedream").to_string(),
                    json.get("illustrationModel").and_then(|v| v.as_str()).unwrap_or("doubao-seedream-4-5-251128").to_string(),
                    json.get("illustrationSize").and_then(|v| v.as_str()).unwrap_or("2560x1440").to_string(),
                );
            }
        }
    }
    ("seedream".into(), "doubao-seedream-4-5-251128".into(), "2560x1440".into())
}

// ── Config Commands ──────────────────────────────────────────────

#[tauri::command]
pub fn get_illustration_config(
    state: tauri::State<'_, AppState>,
) -> IllustrationConfigState {
    let providers = get_providers();
    let (saved_provider, saved_model, saved_size) = read_saved_config(&state.config_dir);

    let provider_def = providers.iter().find(|p| p.id == saved_provider).cloned()
        .unwrap_or_else(|| providers[0].clone());
    let (api_key, source) = load_api_key(&provider_def, &state.config_dir);

    IllustrationConfigState {
        provider: saved_provider,
        model: saved_model,
        api_key_masked: api_key.as_deref().map(mask_key),
        api_key_source: source,
        default_size: saved_size,
        available_providers: providers,
    }
}

#[tauri::command]
pub fn save_illustration_config(
    state: tauri::State<'_, AppState>,
    args: SaveIllustrationConfigArgs,
) -> Result<(), String> {
    let config_path = Path::new(&state.config_dir).join("config.json");
    let mut json: serde_json::Value = if config_path.exists() {
        let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        serde_json::json!({})
    };

    let obj = json.as_object_mut().ok_or("Invalid config format")?;
    obj.insert("illustrationProvider".into(), serde_json::json!(args.provider));
    obj.insert("illustrationModel".into(), serde_json::json!(args.model));
    obj.insert("illustrationSize".into(), serde_json::json!(args.default_size));
    if let Some(key) = args.api_key {
        obj.insert("illustrationApiKey".into(), serde_json::json!(key));
    }

    fs::create_dir_all(&state.config_dir).map_err(|e| e.to_string())?;
    let tmp = config_path.with_extension("tmp");
    fs::write(&tmp, serde_json::to_string_pretty(&json).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    fs::rename(&tmp, &config_path).map_err(|e| e.to_string())?;
    Ok(())
}
