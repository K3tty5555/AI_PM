use serde::{Deserialize, Serialize};
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordInstinctArgs {
    #[serde(rename = "type")]
    pub instinct_type: String,
    pub description: String,
    pub source_project: Option<String>,
}

pub fn instincts_dir() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_default();
    home.join(".config").join("ai-pm").join("instincts")
}

pub fn ensure_instinct_dirs() -> Result<PathBuf, String> {
    let base = instincts_dir();
    for subdir in &["writing", "workflow", "archived"] {
        fs::create_dir_all(base.join(subdir)).map_err(|e| e.to_string())?;
    }
    Ok(base)
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
                        .map(|s| s.trim().trim_matches('"').trim_matches('\'').to_string())
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

fn normalize_description(description: &str) -> String {
    description
        .trim()
        .trim_start_matches(|ch: char| {
            ch.is_ascii_digit() || matches!(ch, '-' | '*' | '•' | '.' | '、' | ' ')
        })
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn short_hash(text: &str) -> String {
    let mut hash = 0x811c9dc5u32;
    for byte in text.as_bytes() {
        hash ^= *byte as u32;
        hash = hash.wrapping_mul(0x01000193);
    }
    format!("{:08x}", hash)
}

fn safe_slug(text: &str) -> String {
    let mut slug = String::new();
    for ch in text.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
        } else if ch.is_whitespace() || matches!(ch, '-' | '_' | ':' | '：' | '/' | '\\') {
            if !slug.ends_with('-') {
                slug.push('-');
            }
        }
        if slug.len() >= 28 {
            break;
        }
    }
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        format!("custom-{}", short_hash(text))
    } else {
        format!("{}-{}", slug, short_hash(text))
    }
}

fn type_prefix(instinct_type: &str) -> &str {
    match instinct_type {
        "workflow" => "F",
        _ => "W",
    }
}

fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

fn format_projects(projects: &[String]) -> String {
    if projects.is_empty() {
        "[]".to_string()
    } else {
        let quoted = projects
            .iter()
            .map(|p| format!("\"{}\"", p.replace('"', "'")))
            .collect::<Vec<_>>()
            .join(", ");
        format!("[{}]", quoted)
    }
}

fn instinct_markdown(entry: &InstinctEntry) -> String {
    format!(
        "---\nid: {}\ntype: {}\nconfidence: {:.1}\nobservations: {}\nfirst_seen: {}\nlast_seen: {}\nsource_projects: {}\n---\n\n{}\n",
        entry.id,
        entry.instinct_type,
        entry.confidence,
        entry.observations,
        entry.first_seen,
        entry.last_seen,
        format_projects(&entry.source_projects),
        entry.description
    )
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

fn list_instincts_internal() -> Result<Vec<InstinctEntry>, String> {
    let base = ensure_instinct_dirs()?;
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
pub async fn list_instincts() -> Result<Vec<InstinctEntry>, String> {
    list_instincts_internal()
}

pub fn active_instinct_prompt(phase: &str) -> String {
    let entries = match list_instincts_internal() {
        Ok(entries) => entries,
        Err(_) => return String::new(),
    };

    let mut writing = Vec::new();
    let mut workflow = Vec::new();
    for entry in entries {
        if entry.confidence < 0.5 {
            continue;
        }
        let line = if entry.confidence >= 0.7 {
            format!("- 必须遵循：{}", entry.description)
        } else {
            format!("- 建议参考：{}", entry.description)
        };
        match entry.instinct_type.as_str() {
            "workflow" => workflow.push(line),
            _ => writing.push(line),
        }
    }

    let mut blocks = Vec::new();
    if matches!(phase, "prd" | "review" | "review-modify" | "prd-assist") && !writing.is_empty() {
        blocks.push(format!(
            "### 用户写作习惯（自动学习）\n\n以下偏好来自用户已确认或多次观察到的 instinct，请用于 PRD 写作、体检和修订：\n{}",
            writing.join("\n")
        ));
    }
    if matches!(
        phase,
        "office-hours" | "requirement" | "analysis" | "prd" | "prototype"
    ) && !workflow.is_empty()
    {
        blocks.push(format!(
            "### 用户流程偏好（自动学习）\n\n以下偏好用于阶段建议和默认决策，不得替代用户当前明确指令：\n{}",
            workflow.join("\n")
        ));
    }

    if blocks.is_empty() {
        String::new()
    } else {
        format!("\n\n---\n\n{}\n", blocks.join("\n\n"))
    }
}

#[tauri::command]
pub async fn record_instinct_candidate(args: RecordInstinctArgs) -> Result<InstinctEntry, String> {
    let instinct_type = match args.instinct_type.as_str() {
        "workflow" => "workflow".to_string(),
        _ => "writing".to_string(),
    };
    let description = normalize_description(&args.description);
    if description.chars().count() < 6 {
        return Err("习惯描述过短".to_string());
    }

    let base = ensure_instinct_dirs()?;
    let dir = base.join(&instinct_type);
    let source_project = args.source_project.unwrap_or_default();

    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let Some(mut inst) = parse_instinct_file(&content, &instinct_type) else {
            continue;
        };
        if inst.description == description {
            inst.observations = inst.observations.saturating_add(1);
            inst.last_seen = today();
            if !source_project.is_empty() && !inst.source_projects.contains(&source_project) {
                inst.source_projects.push(source_project.clone());
            }
            inst.confidence = match inst.observations {
                0 | 1 => inst.confidence.max(0.3),
                2 => inst.confidence.max(0.5),
                _ => inst.confidence.max(0.7),
            };
            fs::write(&path, instinct_markdown(&inst)).map_err(|e| e.to_string())?;
            return Ok(inst);
        }
    }

    let id = format!(
        "INST-{}{}-{}",
        type_prefix(&instinct_type),
        chrono::Local::now().format("%Y%m%d%H%M%S"),
        safe_slug(&description)
    );
    let mut source_projects = Vec::new();
    if !source_project.is_empty() {
        source_projects.push(source_project);
    }
    let entry = InstinctEntry {
        id: id.clone(),
        instinct_type: instinct_type.clone(),
        confidence: 0.3,
        observations: 1,
        first_seen: today(),
        last_seen: today(),
        source_projects,
        description,
    };
    fs::write(dir.join(format!("{}.md", id)), instinct_markdown(&entry))
        .map_err(|e| e.to_string())?;
    Ok(entry)
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
