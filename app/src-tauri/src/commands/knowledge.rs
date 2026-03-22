use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::State;
use tokio::io::AsyncWriteExt;
use crate::state::AppState;
use crate::commands::config::{read_config_internal, is_anthropic, Backend};
use crate::providers::claude_cli::{resolve_claude_binary, enriched_path};

const CATEGORIES: &[&str] = &["patterns", "decisions", "pitfalls", "metrics", "playbooks", "insights"];

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KnowledgeEntry {
    pub id: String,
    pub category: String,
    pub title: String,
    pub content: String,
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
            let title = content.lines()
                .find(|l| l.starts_with("# "))
                .map(|l| l[2..].trim().to_string())
                .unwrap_or_else(|| id.clone());
            entries.push(KnowledgeEntry { id, category: category.to_string(), title, content });
        }
    }
    entries
}

#[tauri::command]
pub fn list_knowledge(state: State<'_, AppState>) -> Vec<KnowledgeEntry> {
    list_knowledge_internal(&state)
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
fn truncate_to_chars(s: &str, max: usize) -> &str {
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

/// Call AI via Anthropic or OpenAI-compatible API (non-streaming).
async fn call_ai_via_api(
    api_key: &str,
    base_url: &str,
    model: &str,
    prompt: &str,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))?;

    if is_anthropic(base_url, model) {
        let url = format!("{}/v1/messages", base_url.trim_end_matches('/'));
        let body = serde_json::json!({
            "model": model,
            "max_tokens": 2048,
            "stream": false,
            "messages": [{"role": "user", "content": prompt}],
        });

        let resp = client
            .post(&url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("HTTP 请求失败：{}", e))?;

        if !resp.status().is_success() {
            let err_body = resp.text().await.unwrap_or_default();
            return Err(format!("Anthropic API 错误：{}", err_body));
        }

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("解析响应失败：{}", e))?;

        json["content"][0]["text"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "Anthropic 响应中未找到 content[0].text".to_string())
    } else {
        let url = format!("{}/v1/chat/completions", base_url.trim_end_matches('/'));
        let body = serde_json::json!({
            "model": model,
            "max_tokens": 2048,
            "stream": false,
            "messages": [{"role": "user", "content": prompt}],
        });

        let resp = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("HTTP 请求失败：{}", e))?;

        if !resp.status().is_success() {
            let err_body = resp.text().await.unwrap_or_default();
            return Err(format!("OpenAI API 错误：{}", err_body));
        }

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("解析响应失败：{}", e))?;

        json["choices"][0]["message"]["content"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "OpenAI 响应中未找到 choices[0].message.content".to_string())
    }
}

/// Call AI via Claude CLI (non-streaming, wait for full output).
async fn call_ai_via_cli(prompt: &str) -> Result<String, String> {
    let binary = resolve_claude_binary();
    let path_env = enriched_path();

    let mut child = tokio::process::Command::new(&binary)
        .arg("--print")
        .arg("--allowedTools")
        .arg("Read")
        .env_remove("CLAUDECODE")
        .env("PATH", &path_env)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("无法启动 claude 命令：{}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(prompt.as_bytes())
            .await
            .map_err(|e| format!("写入 stdin 失败：{}", e))?;
        // drop stdin to close pipe
    }

    let output = child
        .wait_with_output()
        .await
        .map_err(|e| format!("等待 claude 进程失败：{}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "claude 进程异常退出（exit code: {:?}）：{}",
            output.status.code(),
            stderr.chars().take(300).collect::<String>()
        ));
    }

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        return Err("claude 返回了空响应".to_string());
    }

    Ok(text)
}

/// Unified non-streaming AI call — picks API or CLI based on config.
async fn call_ai_non_streaming(config_dir: &str, prompt: &str) -> Result<String, String> {
    let config = read_config_internal(config_dir)
        .ok_or_else(|| "未找到 AI 配置，请先在设置中配置 API Key 或 Claude CLI".to_string())?;

    match config.backend {
        Backend::ClaudeCli => call_ai_via_cli(prompt).await,
        Backend::Api => {
            let api_key = config
                .api_key
                .filter(|k| !k.is_empty())
                .ok_or_else(|| "API Key 未配置".to_string())?;
            let base_url = config
                .base_url
                .filter(|u| !u.is_empty())
                .unwrap_or_else(|| "https://api.anthropic.com".to_string());
            call_ai_via_api(&api_key, &base_url, &config.model, prompt).await
        }
    }
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
