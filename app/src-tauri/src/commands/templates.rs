use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri::State;
use crate::state::AppState;

// ─── PRD Style helpers ──────────────────────────────────────────────────────

/// Validate that a style name is safe to use as a path component.
/// Rejects empty strings, names starting with `.`, and any path-separator
/// or null characters that could be used for directory-traversal attacks.
fn is_safe_style_name(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('.')
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains('\0')
}

/// Load the content of the active (or named) PRD style to inject into the system prompt.
/// Returns None silently if the style directory or files are missing.
pub(crate) fn load_active_prd_style(projects_dir: &str, style_id: Option<&str>) -> Option<String> {
    let styles_dir = Path::new(projects_dir).join("prd-styles");
    if !styles_dir.exists() {
        return None;
    }

    // Determine which style to use: explicit style_id > _active file > first valid dir
    let style_name = if let Some(id) = style_id {
        id.to_string()
    } else {
        let active_file = styles_dir.join("_active");
        if active_file.exists() {
            let s = fs::read_to_string(&active_file).ok()?.trim().to_string();
            if s.is_empty() { return None; }
            s
        } else {
            // Fall back to first directory that has style-config.json
            let mut entries: Vec<_> = fs::read_dir(&styles_dir).ok()?
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_dir() && e.path().join("style-config.json").exists())
                .collect();
            entries.sort_by_key(|e| e.file_name());
            entries.into_iter().next()?.file_name().to_string_lossy().to_string()
        }
    };

    if !is_safe_style_name(&style_name) {
        return None;
    }

    let style_dir = styles_dir.join(&style_name);
    let config_path = style_dir.join("style-config.json");
    if !config_path.exists() {
        return None;
    }

    let config = fs::read_to_string(&config_path).ok()?;
    let profile = fs::read_to_string(style_dir.join("style-profile.json")).ok().unwrap_or_default();
    let template = fs::read_to_string(style_dir.join("feishu-template.md"))
        .ok()
        .map(|t| format!("\n\n## 飞书文档模板（严格按此字段名和顺序输出）\n\n{t}"))
        .unwrap_or_default();

    Some(format!("## 写作风格配置（{style_name}）\n\n{config}\n\n{profile}{template}"))
}

// ─── PRD Style Tauri commands ───────────────────────────────────────────────

#[tauri::command]
pub fn set_active_prd_style(state: State<'_, AppState>, name: String) -> Result<(), String> {
    if !is_safe_style_name(&name) {
        return Err(format!("无效的风格名称: {}", name));
    }
    let styles_dir = Path::new(&state.projects_dir).join("prd-styles");
    fs::create_dir_all(&styles_dir).map_err(|e| e.to_string())?;
    let style_dir = styles_dir.join(&name);
    if !style_dir.join("style-config.json").exists() {
        return Err(format!("风格「{}」不存在", name));
    }
    fs::write(styles_dir.join("_active"), &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_active_prd_style(state: State<'_, AppState>) -> Option<String> {
    let styles_dir = Path::new(&state.projects_dir).join("prd-styles");
    let active_file = styles_dir.join("_active");
    fs::read_to_string(active_file)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrdStyleEntry {
    pub name: String,
    pub has_persona: bool,
}

#[tauri::command]
pub fn list_prd_styles(state: State<'_, AppState>) -> Vec<PrdStyleEntry> {
    let dir = Path::new(&state.projects_dir).join("prd-styles");
    let Ok(entries) = fs::read_dir(&dir) else { return vec![] };
    let mut result: Vec<PrdStyleEntry> = entries
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            if !p.is_dir() { return None; }
            let name = p.file_name()?.to_string_lossy().to_string();
            if name.starts_with('.') { return None; }
            if !p.join("style-config.json").exists() { return None; }
            let has_persona = p.join("style-profile.json").exists();
            Some(PrdStyleEntry { name, has_persona })
        })
        .collect();
    result.sort_by(|a, b| a.name.cmp(&b.name));
    result
}

#[tauri::command]
pub fn add_ui_spec(
    state: State<'_, AppState>,
    dir: String,
) -> Result<String, String> {
    let src = Path::new(&dir);
    if !src.is_dir() {
        return Err(format!("不是有效目录: {}", dir));
    }
    if !src.join("README.md").exists() && !src.join("design-tokens.json").exists() {
        return Err("目录中未找到 README.md 或 design-tokens.json，请确认是 UI 规范目录".to_string());
    }
    let name = src.file_name()
        .ok_or("无法读取目录名")?
        .to_string_lossy()
        .to_string();
    let dest = Path::new(&state.projects_dir).join("ui-specs").join(&name);
    if dest.exists() {
        return Err(format!("「{}」已存在", name));
    }
    copy_dir_all(src, &dest).map_err(|e| e.to_string())?;
    Ok(name)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSpecEntry {
    pub name: String,
}

#[tauri::command]
pub fn list_ui_specs(state: State<'_, AppState>) -> Vec<UiSpecEntry> {
    let dir = Path::new(&state.projects_dir).join("ui-specs");
    let Ok(entries) = fs::read_dir(&dir) else { return vec![] };
    let mut result: Vec<UiSpecEntry> = entries
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            if !p.is_dir() { return None; }
            let name = p.file_name()?.to_string_lossy().to_string();
            if name.starts_with('.') { return None; }
            Some(UiSpecEntry { name })
        })
        .collect();
    result.sort_by(|a, b| a.name.cmp(&b.name));
    result
}

const KB_CATEGORIES: &[&str] = &["patterns", "decisions", "pitfalls", "metrics", "playbooks", "insights"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeCategoryScan {
    pub category: String,
    pub total: usize,
    pub new_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateImportResult {
    pub imported: usize,
    pub skipped: usize,
}

#[tauri::command]
pub fn scan_legacy_knowledge(
    state: State<'_, AppState>,
    dir: String,
) -> Result<Vec<KnowledgeCategoryScan>, String> {
    let path = Path::new(&dir);
    if !path.exists() {
        return Err(format!("目录不存在: {}", dir));
    }

    let dest_root = Path::new(&state.projects_dir).join("knowledge-base");
    let mut results = Vec::new();

    for category in KB_CATEGORIES {
        let src_dir = path.join(category);
        if !src_dir.is_dir() {
            continue;
        }

        let dest_dir = dest_root.join(category);
        let Ok(entries) = fs::read_dir(&src_dir) else { continue };

        let mut total = 0usize;
        let mut new_count = 0usize;

        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }
            total += 1;
            if let Some(filename) = entry_path.file_name() {
                if !dest_dir.join(filename).exists() {
                    new_count += 1;
                }
            }
        }

        if total > 0 {
            results.push(KnowledgeCategoryScan {
                category: category.to_string(),
                total,
                new_count,
            });
        }
    }

    Ok(results)
}

#[tauri::command]
pub fn import_legacy_knowledge(
    state: State<'_, AppState>,
    dir: String,
) -> Result<TemplateImportResult, String> {
    let path = Path::new(&dir);
    if !path.exists() {
        return Err(format!("目录不存在: {}", dir));
    }

    let dest_root = Path::new(&state.projects_dir).join("knowledge-base");
    let mut imported = 0usize;
    let mut skipped = 0usize;

    for category in KB_CATEGORIES {
        let src_dir = path.join(category);
        if !src_dir.is_dir() {
            continue;
        }

        let dest_dir = dest_root.join(category);
        fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

        let Ok(entries) = fs::read_dir(&src_dir) else { continue };

        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }
            if let Some(filename) = entry_path.file_name() {
                let dest_path = dest_dir.join(filename);
                if dest_path.exists() {
                    skipped += 1;
                } else if fs::copy(&entry_path, &dest_path).is_ok() {
                    imported += 1;
                }
                // silently skip files that fail to copy (e.g. permission errors)
            }
        }
    }

    Ok(TemplateImportResult { imported, skipped })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrdStyleScan {
    pub name: String,
    pub has_persona: bool,
    pub already_exists: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSpecScan {
    pub name: String,
    pub already_exists: bool,
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        if file_type.is_symlink() {
            continue; // skip symlinks to avoid traversal outside source tree
        }
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_all(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn scan_legacy_prd_styles(
    state: State<'_, AppState>,
    dir: String,
) -> Result<Vec<PrdStyleScan>, String> {
    let path = Path::new(&dir);
    if !path.exists() {
        return Err(format!("目录不存在: {}", dir));
    }

    let dest_root = Path::new(&state.projects_dir).join("prd-styles");
    let mut results = Vec::new();

    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let entry_path = entry.path();
        if !entry_path.is_dir() {
            continue;
        }
        let name = entry_path.file_name().unwrap_or_default().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        if !entry_path.join("style-config.json").exists() {
            continue;
        }
        let has_persona = entry_path.join("style-profile.json").exists();
        let already_exists = dest_root.join(&name).exists();

        results.push(PrdStyleScan { name, has_persona, already_exists });
    }

    results.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(results)
}

#[tauri::command]
pub fn import_legacy_prd_styles(
    state: State<'_, AppState>,
    dir: String,
) -> Result<TemplateImportResult, String> {
    let path = Path::new(&dir);
    if !path.exists() {
        return Err(format!("目录不存在: {}", dir));
    }

    let dest_root = Path::new(&state.projects_dir).join("prd-styles");
    fs::create_dir_all(&dest_root).map_err(|e| e.to_string())?;

    let mut imported = 0usize;
    let mut skipped = 0usize;

    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let entry_path = entry.path();
        if !entry_path.is_dir() {
            continue;
        }
        let name = entry_path.file_name().unwrap_or_default().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        if !entry_path.join("style-config.json").exists() {
            continue;
        }
        let dest_dir = dest_root.join(&name);
        if dest_dir.exists() {
            skipped += 1;
            continue;
        }
        copy_dir_all(&entry_path, &dest_dir).map_err(|e| e.to_string())?;
        imported += 1;
    }

    Ok(TemplateImportResult { imported, skipped })
}

#[tauri::command]
pub fn scan_legacy_ui_specs(
    state: State<'_, AppState>,
    dir: String,
) -> Result<Vec<UiSpecScan>, String> {
    let path = Path::new(&dir);
    if !path.exists() {
        return Err(format!("目录不存在: {}", dir));
    }

    let dest_root = Path::new(&state.projects_dir).join("ui-specs");
    let mut results = Vec::new();

    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let entry_path = entry.path();
        if !entry_path.is_dir() {
            continue;
        }
        let name = entry_path.file_name().unwrap_or_default().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        // Valid ui-spec dir contains README.md or design-tokens.json
        if !entry_path.join("README.md").exists() && !entry_path.join("design-tokens.json").exists() {
            continue;
        }
        let already_exists = dest_root.join(&name).exists();

        results.push(UiSpecScan { name, already_exists });
    }

    results.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(results)
}

#[tauri::command]
pub fn import_legacy_ui_specs(
    state: State<'_, AppState>,
    dir: String,
) -> Result<TemplateImportResult, String> {
    let path = Path::new(&dir);
    if !path.exists() {
        return Err(format!("目录不存在: {}", dir));
    }

    let dest_root = Path::new(&state.projects_dir).join("ui-specs");
    fs::create_dir_all(&dest_root).map_err(|e| e.to_string())?;

    let mut imported = 0usize;
    let mut skipped = 0usize;

    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let entry_path = entry.path();
        if !entry_path.is_dir() {
            continue;
        }
        let name = entry_path.file_name().unwrap_or_default().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        if !entry_path.join("README.md").exists() && !entry_path.join("design-tokens.json").exists() {
            continue;
        }
        let dest_dir = dest_root.join(&name);
        if dest_dir.exists() {
            skipped += 1;
            continue;
        }
        copy_dir_all(&entry_path, &dest_dir).map_err(|e| e.to_string())?;
        imported += 1;
    }

    Ok(TemplateImportResult { imported, skipped })
}
