use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri::State;
use crate::state::AppState;

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
                } else {
                    fs::copy(&entry_path, &dest_path).map_err(|e| e.to_string())?;
                    imported += 1;
                }
            }
        }
    }

    Ok(TemplateImportResult { imported, skipped })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignSpecScan {
    pub name: String,
    pub has_persona: bool,
    pub already_exists: bool,
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_all(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn scan_legacy_design_specs(
    state: State<'_, AppState>,
    dir: String,
) -> Result<Vec<DesignSpecScan>, String> {
    let path = Path::new(&dir);
    if !path.exists() {
        return Err(format!("目录不存在: {}", dir));
    }

    let dest_root = Path::new(&state.projects_dir).join("design-specs");
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

        results.push(DesignSpecScan { name, has_persona, already_exists });
    }

    results.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(results)
}

#[tauri::command]
pub fn import_legacy_design_specs(
    state: State<'_, AppState>,
    dir: String,
) -> Result<TemplateImportResult, String> {
    let path = Path::new(&dir);
    if !path.exists() {
        return Err(format!("目录不存在: {}", dir));
    }

    let dest_root = Path::new(&state.projects_dir).join("design-specs");
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
