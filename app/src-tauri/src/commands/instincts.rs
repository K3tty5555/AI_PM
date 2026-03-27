use serde::Serialize;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstinctEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub instinct_type: String,
    pub confidence: f64,
    pub observations: u32,
    pub first_seen: String,
    pub last_seen: String,
    pub source_projects: Vec<String>,
    pub description: String,
}

fn instincts_dir() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_default();
    home.join(".config").join("ai-pm").join("instincts")
}

/// Parse YAML frontmatter from an instinct markdown file.
///
/// Expected format:
/// ```text
/// ---
/// id: INST-W001
/// type: writing
/// confidence: 0.6
/// observations: 3
/// first_seen: 2026-03-15
/// last_seen: 2026-03-27
/// source_projects: ["智学网考试报告", "员工培训系统"]
/// ---
///
/// PRD 不写背景章节，开头直接是功能模块。
/// ```
fn parse_instinct_file(content: &str, subdir: &str) -> Option<InstinctEntry> {
    // Must start with "---"
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return None;
    }

    // Find the closing "---"
    let after_open = &trimmed[3..];
    let close_idx = after_open.find("\n---")?;
    let frontmatter = &after_open[..close_idx];
    let body = after_open[close_idx + 4..].trim();

    let mut id = String::new();
    let mut instinct_type = subdir.to_string();
    let mut confidence: f64 = 0.0;
    let mut observations: u32 = 0;
    let mut first_seen = String::new();
    let mut last_seen = String::new();
    let mut source_projects: Vec<String> = Vec::new();

    for line in frontmatter.lines() {
        let line = line.trim();
        if let Some((key, value)) = line.split_once(':') {
            let key = key.trim();
            let value = value.trim();
            match key {
                "id" => id = value.to_string(),
                "type" => instinct_type = value.to_string(),
                "confidence" => confidence = value.parse().unwrap_or(0.0),
                "observations" => observations = value.parse().unwrap_or(0),
                "first_seen" => first_seen = value.to_string(),
                "last_seen" => last_seen = value.to_string(),
                "source_projects" => {
                    // Parse ["a", "b"] format
                    let stripped = value.trim_start_matches('[').trim_end_matches(']');
                    source_projects = stripped
                        .split(',')
                        .map(|s| {
                            s.trim()
                                .trim_matches('"')
                                .trim_matches('\'')
                                .to_string()
                        })
                        .filter(|s| !s.is_empty())
                        .collect();
                }
                _ => {}
            }
        }
    }

    if id.is_empty() {
        return None;
    }

    // First non-empty line of the body is the description
    let description = body
        .lines()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("")
        .trim()
        .to_string();

    Some(InstinctEntry {
        id,
        instinct_type,
        confidence,
        observations,
        first_seen,
        last_seen,
        source_projects,
        description,
    })
}

/// Find the line in the content that starts with "confidence:"
fn find_confidence_line(content: &str) -> String {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("confidence:") {
            return trimmed.to_string();
        }
    }
    String::new()
}

#[tauri::command]
pub async fn list_instincts() -> Result<Vec<InstinctEntry>, String> {
    let base = instincts_dir();
    let mut entries = Vec::new();

    for subdir in &["writing", "workflow"] {
        let dir = base.join(subdir);
        if !dir.exists() {
            continue;
        }
        let read_dir = fs::read_dir(&dir).map_err(|e| e.to_string())?;
        for entry in read_dir.flatten() {
            let path = entry.path();
            if path.extension().map(|e| e == "md").unwrap_or(false) {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Some(inst) = parse_instinct_file(&content, subdir) {
                        entries.push(inst);
                    }
                }
            }
        }
    }

    // Sort by confidence descending
    entries.sort_by(|a, b| {
        b.confidence
            .partial_cmp(&a.confidence)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(entries)
}

#[tauri::command]
pub async fn confirm_instinct(id: String) -> Result<(), String> {
    let base = instincts_dir();
    for subdir in &["writing", "workflow"] {
        let dir = base.join(subdir);
        if !dir.exists() {
            continue;
        }
        for entry in fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
            let path = entry.path();
            if let Ok(content) = fs::read_to_string(&path) {
                if content.contains(&format!("id: {}", id)) {
                    let conf_line = find_confidence_line(&content);
                    if conf_line.is_empty() {
                        return Err("confidence 字段未找到".to_string());
                    }
                    let updated = content.replace(&conf_line, "confidence: 0.9");
                    // Atomic write: write to temp file then rename
                    let tmp = path.with_extension("tmp");
                    fs::write(&tmp, &updated).map_err(|e| e.to_string())?;
                    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
                    return Ok(());
                }
            }
        }
    }
    Err(format!("直觉 {} 未找到", id))
}

#[tauri::command]
pub async fn delete_instinct(id: String) -> Result<(), String> {
    let base = instincts_dir();
    for subdir in &["writing", "workflow"] {
        let dir = base.join(subdir);
        if !dir.exists() {
            continue;
        }
        for entry in fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
            let path = entry.path();
            if let Ok(content) = fs::read_to_string(&path) {
                if content.contains(&format!("id: {}", id)) {
                    fs::remove_file(&path).map_err(|e| e.to_string())?;
                    return Ok(());
                }
            }
        }
    }
    Err(format!("直觉 {} 未找到", id))
}
