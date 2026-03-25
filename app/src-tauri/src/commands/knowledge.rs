use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::State;
use crate::state::AppState;
use crate::providers::ai_call::call_ai_non_streaming;

const CATEGORIES: &[&str] = &["patterns", "decisions", "pitfalls", "metrics", "playbooks", "insights"];

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KnowledgeEntry {
    pub id: String,
    pub category: String,
    pub title: String,
    pub content: String,
    pub source: String,  // "manual" or "auto"
}

/// 全量遍历文件系统 + 内存子串匹配。
/// 适用规模：<500 条（冷启动 <100ms）。
/// 迁移方案：500+ 条时，将 title/content 索引到 SQLite FTS5 虚拟表，
/// 复用现有 db.rs 的 Connection。参考：https://www.sqlite.org/fts5.html
fn list_knowledge_internal(state: &AppState) -> Vec<KnowledgeEntry> {
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
            let source = if id.starts_with("auto-") { "auto" } else { "manual" };
            let title = content.lines()
                .find(|l| l.starts_with("# "))
                .map(|l| l[2..].trim().to_string())
                .unwrap_or_else(|| id.clone());
            entries.push(KnowledgeEntry { id, category: category.to_string(), title, content, source: source.to_string() });
        }
    }
    entries
}

#[tauri::command]
pub fn list_knowledge(state: State<'_, AppState>) -> Vec<KnowledgeEntry> {
    list_knowledge_internal(&state)
}

/// Recommend knowledge entries relevant to the current project phase.
/// Called internally from stream.rs — NOT a Tauri command (avoids Mutex deadlock).
pub fn recommend_knowledge_internal(
    templates_base: &Path,
    output_dir: &str,
    _phase: &str,
) -> Vec<KnowledgeEntry> {
    let kb_root = templates_base.join("knowledge-base");
    if !kb_root.exists() {
        return Vec::new();
    }

    // Read analysis report headings as keywords
    let analysis_path = std::path::Path::new(output_dir).join("02-analysis-report.md");
    let keywords: Vec<String> = match fs::read_to_string(&analysis_path) {
        Ok(content) => content
            .lines()
            .filter(|l| l.starts_with('#'))
            .map(|l| l.trim_start_matches('#').trim().to_lowercase())
            .filter(|k| !k.is_empty())
            .collect(),
        Err(_) => return Vec::new(),
    };

    if keywords.is_empty() {
        return Vec::new();
    }

    // Collect all entries
    let mut all_entries = Vec::new();
    for category in CATEGORIES {
        let cat_dir = kb_root.join(category);
        if !cat_dir.exists() { continue; }
        let Ok(dir) = fs::read_dir(&cat_dir) else { continue; };
        for file in dir.filter_map(|e| e.ok()) {
            let path = file.path();
            if path.extension().and_then(|e| e.to_str()) != Some("md") { continue; }
            let Ok(content) = fs::read_to_string(&path) else { continue; };
            let id = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
            let source = if id.starts_with("auto-") { "auto" } else { "manual" };
            let title = content.lines()
                .find(|l| l.starts_with("# "))
                .map(|l| l[2..].trim().to_string())
                .unwrap_or_else(|| id.clone());
            all_entries.push(KnowledgeEntry {
                id, category: category.to_string(), title, content, source: source.to_string(),
            });
        }
    }

    // Score entries by keyword matching
    let mut scored: Vec<(KnowledgeEntry, i32)> = all_entries
        .into_iter()
        .filter_map(|entry| {
            let title_lower = entry.title.to_lowercase();
            let content_lower = entry.content.to_lowercase();
            let mut score: i32 = 0;
            for kw in &keywords {
                if title_lower.contains(kw.as_str()) { score += 3; }
                if content_lower.contains(kw.as_str()) { score += 1; }
            }
            if score == 0 { return None; }
            Some((entry, score))
        })
        .collect();

    scored.sort_by(|a, b| b.1.cmp(&a.1));

    // Return top 5 entries, total content limited to 2000 chars
    let mut result = Vec::new();
    let mut total_chars = 0usize;
    for (entry, _) in scored {
        let entry_len = entry.content.len();
        if total_chars + entry_len > 2000 && !result.is_empty() {
            break;
        }
        total_chars += entry_len;
        result.push(entry);
        if result.len() >= 5 {
            break;
        }
    }

    result
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

    Ok(KnowledgeEntry { id: final_slug, category: args.category, title: args.title, content: full_content, source: "manual".to_string() })
}

/// 全量遍历文件系统 + 内存子串匹配。
/// 适用规模：<500 条（冷启动 <100ms）。
/// 迁移方案：500+ 条时，将 title/content 索引到 SQLite FTS5 虚拟表，
/// 复用现有 db.rs 的 Connection。参考：https://www.sqlite.org/fts5.html
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
            let source = if id.starts_with("auto-") { "auto" } else { "manual" };
            if title.to_lowercase().contains(&q) || content_lower.contains(&q) {
                entries.push(KnowledgeEntry { id, category: category.to_string(), title, content, source: source.to_string() });
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

/// Return full markdown content of a single knowledge entry.
#[tauri::command]
pub async fn get_knowledge_content(
    state: State<'_, AppState>,
    category: String,
    id: String,
) -> Result<String, String> {
    // Prevent path traversal — consolidated guard (matches delete_knowledge entry pattern)
    if category.contains('/') || category.contains('.') ||
       id.contains('/') || id.contains('\\') || id.contains("..") {
        return Err("无效路径".to_string());
    }
    // Validate category against whitelist
    if !CATEGORIES.contains(&category.as_str()) {
        return Err("无效分类".to_string());
    }
    let path = state.templates_base()
        .join("knowledge-base")
        .join(&category)
        .join(format!("{}.md", id));
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendKnowledgeArgs {
    pub project_id: String,
    pub timing: String, // "before_prd" | "before_review"
}

#[tauri::command]
pub fn recommend_knowledge(
    state: State<'_, AppState>,
    args: RecommendKnowledgeArgs,
) -> Result<Vec<KnowledgeEntry>, String> {
    // 1. Query project output_dir from database
    let output_dir: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            params![&args.project_id],
            |row| row.get(0),
        ).map_err(|e| format!("项目不存在: {}", e))?
    };

    // 2. Read analysis report and extract headings as keywords
    let analysis_path = std::path::Path::new(&output_dir).join("02-analysis-report.md");
    let keywords: Vec<String> = match fs::read_to_string(&analysis_path) {
        Ok(content) => content
            .lines()
            .filter(|l| l.starts_with('#'))
            .map(|l| l.trim_start_matches('#').trim().to_lowercase())
            .filter(|k| !k.is_empty())
            .collect(),
        Err(_) => return Ok(Vec::new()), // graceful degradation
    };

    if keywords.is_empty() {
        return Ok(Vec::new());
    }

    // 3. Score each knowledge entry by keyword matching
    let entries = list_knowledge_internal(&state);
    let mut scored: Vec<(KnowledgeEntry, i32)> = entries
        .into_iter()
        .filter_map(|entry| {
            let title_lower = entry.title.to_lowercase();
            let content_lower = entry.content.to_lowercase();
            let mut score: i32 = 0;

            for kw in &keywords {
                if title_lower.contains(kw.as_str()) {
                    score += 3;
                }
                if content_lower.contains(kw.as_str()) {
                    score += 1;
                }
            }

            if score == 0 {
                return None;
            }

            // 4. Boost pitfalls and decisions when timing is before_review
            if args.timing == "before_review"
                && (entry.category == "pitfalls" || entry.category == "decisions")
            {
                score *= 2;
            }

            Some((entry, score))
        })
        .collect();

    // 5. Sort descending by score, return top 10
    scored.sort_by(|a, b| b.1.cmp(&a.1));
    let result: Vec<KnowledgeEntry> = scored.into_iter().take(10).map(|(e, _)| e).collect();

    Ok(result)
}

// ── extract_knowledge_candidates ─────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeCandidate {
    pub category: String,
    pub title: String,
    pub content: String,
    pub source: String,
}

/// Truncate a string to at most `max` characters, respecting UTF-8 char boundaries.
pub fn truncate_to_chars(s: &str, max: usize) -> &str {
    match s.char_indices().nth(max) {
        Some((idx, _)) => &s[..idx],
        None => s,
    }
}

/// Parse AI response into KnowledgeCandidate vec with fallback extraction.
fn parse_candidates_json(raw: &str) -> Result<Vec<KnowledgeCandidate>, String> {
    let trimmed = raw.trim();

    // Strip markdown code fences: ```json ... ``` or ``` ... ```
    let stripped = if trimmed.starts_with("```") {
        let inner = trimmed
            .trim_start_matches("```json")
            .trim_start_matches("```");
        inner.trim_end_matches("```").trim()
    } else {
        trimmed
    };

    // Attempt 1: direct parse
    if let Ok(candidates) = serde_json::from_str::<Vec<KnowledgeCandidate>>(stripped) {
        return Ok(candidates);
    }

    // Attempt 2: extract content between first '[' and last ']'
    if let Some(start) = stripped.find('[') {
        if let Some(end) = stripped.rfind(']') {
            if end > start {
                let slice = &stripped[start..=end];
                if let Ok(candidates) = serde_json::from_str::<Vec<KnowledgeCandidate>>(slice) {
                    return Ok(candidates);
                }
            }
        }
    }

    Err(format!(
        "AI 返回的内容无法解析为知识点列表，原始内容前 200 字符：{}",
        stripped.chars().take(200).collect::<String>()
    ))
}

#[tauri::command]
pub async fn extract_knowledge_candidates(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<KnowledgeCandidate>, String> {
    // 1. Query project output_dir from database
    let (output_dir, config_dir) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let dir: String = db
            .query_row(
                "SELECT output_dir FROM projects WHERE id = ?1",
                params![&project_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("项目不存在：{}", e))?;
        (dir, state.config_dir.clone())
    };

    let base = Path::new(&output_dir);

    // 2. Read artifacts — PRD is required (try two possible paths)
    let prd_path = base.join("05-prd").join("05-PRD-v1.0.md");
    let prd_fallback = base.join("05-PRD-v1.0.md");
    let prd_content = fs::read_to_string(&prd_path)
        .or_else(|_| fs::read_to_string(&prd_fallback))
        .map_err(|_| "未找到 PRD 文件（05-prd/05-PRD-v1.0.md），请先完成 PRD 阶段".to_string())?;

    let review_content = fs::read_to_string(base.join("08-review-report.md")).ok();
    let retro_content = fs::read_to_string(base.join("10-retrospective.md")).ok();

    // 3. Build prompt with truncated artifacts
    let mut artifacts = String::new();
    artifacts.push_str("## PRD 文档\n\n");
    artifacts.push_str(truncate_to_chars(&prd_content, 6000));
    artifacts.push('\n');

    if let Some(ref review) = review_content {
        artifacts.push_str("\n## 评审报告\n\n");
        artifacts.push_str(truncate_to_chars(review, 4000));
        artifacts.push('\n');
    }

    if let Some(ref retro) = retro_content {
        artifacts.push_str("\n## 复盘总结\n\n");
        artifacts.push_str(truncate_to_chars(retro, 3000));
        artifacts.push('\n');
    }

    let prompt = format!(
        "你是一位产品知识管理专家。请分析以下项目产出物，提取 3-5 条值得沉淀的经验知识。\n\n\
         每条知识必须包含：\n\
         - category: 分类，只能是 patterns / decisions / pitfalls / metrics / playbooks / insights 之一\n\
         - title: 简短标题（10-20字）\n\
         - content: 具体内容（50-150字，包含背景、结论、适用场景）\n\
         - source: 提取来源，只能是 \"PRD\" / \"评审报告\" / \"复盘总结\" 之一\n\n\
         请直接输出 JSON 数组，不要输出任何其他内容。\n\n\
         {}",
        artifacts
    );

    // 4. Call AI (non-streaming)
    let raw = call_ai_non_streaming(&config_dir, &prompt).await?;

    // 5. Parse response
    parse_candidates_json(&raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_truncate_ascii() {
        assert_eq!(truncate_to_chars("hello world", 5), "hello");
    }
    #[test]
    fn test_truncate_cjk() {
        assert_eq!(truncate_to_chars("你好世界测试", 4), "你好世界");
    }
    #[test]
    fn test_truncate_shorter_than_max() {
        assert_eq!(truncate_to_chars("hi", 10), "hi");
    }
    #[test]
    fn test_truncate_zero() {
        assert_eq!(truncate_to_chars("hello", 0), "");
    }
    #[test]
    fn test_truncate_empty() {
        assert_eq!(truncate_to_chars("", 5), "");
    }
}
