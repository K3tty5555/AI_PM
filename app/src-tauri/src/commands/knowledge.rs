use serde::{Deserialize, Serialize};
use std::fs;
use tauri::State;
use crate::state::AppState;

const CATEGORIES: &[&str] = &["patterns", "decisions", "pitfalls", "metrics", "playbooks", "insights"];

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KnowledgeEntry {
    pub id: String,
    pub category: String,
    pub title: String,
    pub content: String,
}

#[tauri::command]
pub fn list_knowledge(state: State<'_, AppState>) -> Vec<KnowledgeEntry> {
    let kb_root = state.templates_base().join("knowledge-base");
    let mut entries = Vec::new();

    for category in CATEGORIES {
        let cat_dir = kb_root.join(category);
        if !cat_dir.exists() { continue; }
        let Ok(dir) = fs::read_dir(&cat_dir) else { continue; };
        for file in dir.filter_map(|e| e.ok()) {
            let path = file.path();
            if path.extension().and_then(|e| e.to_str()) != Some("md") { continue; }
            let Ok(content) = fs::read_to_string(&path) else { continue; };
            let id = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
            let title = content.lines()
                .find(|l| l.starts_with("# "))
                .map(|l| l[2..].trim().to_string())
                .unwrap_or_else(|| id.clone());
            entries.push(KnowledgeEntry { id, category: category.to_string(), title, content });
        }
    }
    entries
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddKnowledgeArgs {
    pub category: String,
    pub title: String,
    pub content: String,
}

#[tauri::command]
pub fn add_knowledge(state: State<'_, AppState>, args: AddKnowledgeArgs) -> Result<KnowledgeEntry, String> {
    if !CATEGORIES.contains(&args.category.as_str()) {
        return Err(format!("Invalid category: {}", args.category));
    }
    let kb_dir = state.templates_base().join("knowledge-base").join(&args.category);
    fs::create_dir_all(&kb_dir).map_err(|e| e.to_string())?;

    // 用标题生成 slug
    let slug: String = args.title.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
        .to_lowercase();
    let slug = if slug.is_empty() {
        format!("entry-{}", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs())
    } else { slug };

    // Ensure slug is unique — append timestamp if path already exists
    let mut final_slug = slug.clone();
    let mut candidate = kb_dir.join(format!("{}.md", &final_slug));
    if candidate.exists() {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        final_slug = format!("{}-{}", slug, ts);
        candidate = kb_dir.join(format!("{}.md", &final_slug));
    }
    let path = candidate;

    let full_content = format!("# {}\n\n{}", args.title, args.content);
    fs::write(&path, &full_content).map_err(|e| e.to_string())?;

    Ok(KnowledgeEntry { id: final_slug, category: args.category, title: args.title, content: full_content })
}

#[tauri::command]
pub fn search_knowledge(state: State<'_, AppState>, query: String) -> Vec<KnowledgeEntry> {
    let q = query.to_lowercase();
    if q.trim().is_empty() {
        return Vec::new();
    }
    let kb_root = state.templates_base().join("knowledge-base");
    let mut entries = Vec::new();

    for category in CATEGORIES {
        let cat_dir = kb_root.join(category);
        if !cat_dir.exists() { continue; }
        let Ok(dir) = fs::read_dir(&cat_dir) else { continue; };
        for file in dir.filter_map(|e| e.ok()) {
            let path = file.path();
            if path.extension().and_then(|e| e.to_str()) != Some("md") { continue; }
            let Ok(content) = fs::read_to_string(&path) else { continue; };
            let content_lower = content.to_lowercase();
            let id = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
            let title = content.lines()
                .find(|l| l.starts_with("# "))
                .map(|l| l[2..].trim().to_string())
                .unwrap_or_else(|| id.clone());
            if title.to_lowercase().contains(&q) || content_lower.contains(&q) {
                entries.push(KnowledgeEntry { id, category: category.to_string(), title, content });
                if entries.len() >= 20 { return entries; }
            }
        }
    }
    entries
}

#[tauri::command]
pub fn delete_knowledge(state: State<'_, AppState>, category: String, id: String) -> Result<(), String> {
    // Validate inputs to prevent path traversal
    if !CATEGORIES.contains(&category.as_str()) {
        return Err(format!("Invalid category: {}", category));
    }
    if id.contains('/') || id.contains('\\') || id.contains("..") {
        return Err("Invalid id".to_string());
    }
    let path = state.templates_base()
        .join("knowledge-base").join(&category).join(format!("{}.md", id));
    if path.exists() { fs::remove_file(&path).map_err(|e| e.to_string())?; }
    Ok(())
}
