use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::Instant;
use tauri::{AppHandle, Emitter, State};
use crate::state::AppState;
use crate::commands::config::{read_config_internal, Backend};
use crate::commands::stream::ChatMessage;

// C1: Allowlist of valid tool names — prevents path traversal via tool_name
const VALID_TOOLS: &[&str] = &[
    "ai-pm-priority",
    "ai-pm-weekly",
    "ai-pm-data",
    "ai-pm-interview",
    "ai-pm-persona",
    "ai-pm-knowledge",
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunToolArgs {
    pub tool_name: String,
    pub user_input: String,
    /// Optional: attach a file path (for data analysis)
    pub file_path: Option<String>,
    pub project_id: Option<String>,
    /// Optional mode for data tool: "dashboard" | "metrics"
    pub mode: Option<String>,
}

#[tauri::command]
pub async fn run_tool(
    app: AppHandle,
    state: State<'_, AppState>,
    args: RunToolArgs,
) -> Result<(), String> {
    let stream_key = format!("tool:{}", args.tool_name);

    // C1: Reject unknown tool names before any path operations
    if !VALID_TOOLS.contains(&args.tool_name.as_str()) {
        let msg = format!("未知工具：{}", args.tool_name);
        let _ = app.emit("stream_error", serde_json::json!({ "streamKey": &stream_key, "message": &msg }));
        return Err(msg);
    }

    // Load skill from bundled resources — I1: use shared load_skill (reads all sub-files)
    let skills_root = crate::commands::stream::resolve_skills_root(&app)
        .map_err(|e| {
            let _ = app.emit("stream_error", serde_json::json!({ "streamKey": &stream_key, "message": &e }));
            e
        })?;

    // I1: Replace manual SKILL.md read with shared load_skill that also loads sub-files.
    // I3: map_err emits stream_error before returning, satisfying Fix I3.
    let skill_content = crate::commands::stream::load_skill(&skills_root, &args.tool_name)
        .map_err(|e| {
            let _ = app.emit("stream_error", serde_json::json!({ "streamKey": &stream_key, "message": &e }));
            e
        })?;

    // Read config early — needed to determine file handling strategy
    let config = read_config_internal(&state.config_dir)
        .ok_or_else(|| {
            let msg = "未配置 AI 后端 — 请前往「设置」页面完成配置后重试。".to_string();
            let _ = app.emit("stream_error", serde_json::json!({ "streamKey": &stream_key, "message": &msg }));
            msg
        })?;

    // If a file is attached, read it and append to user_input
    let user_input_full = if let Some(fpath) = &args.file_path {
        // C2: Canonicalize and verify path is under projects_dir
        let canonical = std::fs::canonicalize(fpath)
            .map_err(|e| {
                let msg = format!("无法解析文件路径 {}: {}", fpath, e);
                let _ = app.emit("stream_error", serde_json::json!({ "streamKey": &stream_key, "message": &msg }));
                msg
            })?;

        // Read-only access: allow any path (user may upload templates from Desktop, Downloads, etc.)
        // Only write operations (not in this function) should enforce projects_dir restriction.
        if !canonical.is_file() {
            let msg = format!("文件不存在：{}", fpath);
            let _ = app.emit("stream_error", serde_json::json!({ "streamKey": &stream_key, "message": &msg }));
            return Err(msg);
        }

        // File size limit (10MB)
        let file_size = canonical.metadata().map(|m| m.len()).unwrap_or(0);
        if file_size > 10 * 1024 * 1024 {
            let msg = format!("文件过大（{:.1}MB），上限 10MB", file_size as f64 / 1024.0 / 1024.0);
            let _ = app.emit("stream_error", serde_json::json!({ "streamKey": &stream_key, "message": &msg }));
            return Err(msg);
        }

        // Block dotfiles (security: prevent reading ~/.ssh, ~/.env, etc.)
        if canonical.file_name().and_then(|n| n.to_str()).map(|n| n.starts_with('.')).unwrap_or(false)
            || canonical.components().any(|c| c.as_os_str().to_str().map(|s| s.starts_with('.')).unwrap_or(false))
        {
            let msg = "不支持读取隐藏文件或隐藏目录中的文件".to_string();
            let _ = app.emit("stream_error", serde_json::json!({ "streamKey": &stream_key, "message": &msg }));
            return Err(msg);
        }

        let is_excel = canonical.extension()
            .and_then(|e| e.to_str())
            .map(|e| matches!(e.to_lowercase().as_str(), "xlsx" | "xls"))
            .unwrap_or(false);

        if is_excel {
            match config.backend {
                Backend::Api => {
                    let msg = "Excel 文件不支持 API 模式，请切换到「Claude CLI」后端，或将文件另存为 CSV 格式后重试。".to_string();
                    let _ = app.emit("stream_error", serde_json::json!({ "streamKey": &stream_key, "message": &msg }));
                    return Err(msg);
                }
                Backend::ClaudeCli => {
                    // Inject path only — CLI agent uses Python/openpyxl to read the file
                    format!(
                        "{}\n\n---\n\n数据文件路径（Excel）：{}\n\n该文件为 Excel 格式，请使用 Python openpyxl（data_only=True）读取后分析。",
                        args.user_input, fpath
                    )
                }
            }
        } else {
            match fs::read_to_string(&canonical) {
                Ok(content) => format!("{}\n\n---\n\n附件内容（{}）：\n\n{}", args.user_input, fpath, content),
                Err(e) => {
                    let msg = format!("无法读取文件 {}: {}", fpath, e);
                    let _ = app.emit("stream_error", serde_json::json!({ "streamKey": &stream_key, "message": &msg }));
                    return Err(msg);
                }
            }
        }
    } else {
        args.user_input.clone()
    };

    // Build system prompt: skill content + non-interactive instructions
    // Rules kept consistent with stream.rs build_system_prompt (same 5 rules, same wording)
    let mut system_prompt = format!(
        "{}\n\n---\n\n### ⚠️ 非交互模式（优先级最高，覆盖以上所有指令）\n\n你正在 **AI PM 桌面应用的流式输出模式**中运行，你的整个回复内容就是文档本身。\n\n**强制规则（逐条执行）：**\n1. **第一行就是文档标题**（如 `# PRD：产品名`），最后一行是文档结尾，不要有任何前言或后记\n2. **禁止输出元信息**：「已生成」「文件已保存」「执行步骤」「操作结果」「PRD 已完成」等一律不输出\n3. **禁止调用任何工具**：Write、Edit、Bash、AskUserQuestion 在此环境中均不存在，调用无效\n4. **禁止提问或确认**：导出格式默认「仅 Markdown」，用户故事按标准编写，直接生成内容\n5. **禁止过渡语句**：不要输出「好的我来生成」「首先我会」等，直接从文档第一行开始",
        skill_content
    );

    // Inject mode-specific instructions for data tool
    if args.tool_name == "ai-pm-data" {
        match args.mode.as_deref() {
            Some("dashboard") => {
                system_prompt.push_str("\n\n---\n\n你的整个输出就是一个完整的 HTML 仪表盘文件，第一行必须是 <!DOCTYPE html>，遵循 Apple HIG 风格，数据驱动，支持筛选联动，无需任何说明文字，直接输出 HTML。");
            }
            Some("metrics") => {
                system_prompt.push_str("\n\n---\n\n你是一位数据分析专家，输出结构化指标体系文档，包含：北极星指标、一级分解指标、过程指标、数据口径定义、埋点建议。用 Markdown 表格输出，清晰易读。");
            }
            _ => {}
        }
    }

    // Inject active PRD style for weekly and priority tools (persona carries over to tool outputs)
    if args.tool_name == "ai-pm-weekly" || args.tool_name == "ai-pm-priority" {
        let templates_base = state.templates_base();
        if let Some(style) = crate::commands::templates::load_active_prd_style(&templates_base, None) {
            system_prompt.push_str(&format!("\n\n---\n\n{}", style));
        }
    }

    let stream_start = Instant::now();

    // I2: Compute and create tools_dir BEFORE provider selection so it can be used as work_dir
    let tools_dir = Path::new(&state.projects_dir).join("tools").join(&args.tool_name);
    let _ = fs::create_dir_all(&tools_dir);
    let tools_dir_str = tools_dir.to_string_lossy().to_string();

    let provider: Box<dyn crate::providers::AiProvider> = match config.backend {
        Backend::ClaudeCli => Box::new(crate::providers::claude_cli::ClaudeCliProvider {
            work_dir: tools_dir_str,  // I2: use tools_dir as work_dir, not projects_dir
        }),
        Backend::Api => {
            let base_url = config.base_url.unwrap_or_else(|| "https://api.anthropic.com".to_string());
            let api_key = config.api_key.unwrap_or_default();
            let model = config.model.clone();
            if crate::commands::config::is_anthropic(&base_url, &model) {
                Box::new(crate::providers::anthropic::AnthropicProvider { api_key, base_url, model })
            } else {
                Box::new(crate::providers::openai::OpenAIProvider { api_key, base_url, model })
            }
        }
    };

    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: user_input_full,
    }];

    match provider.stream(&system_prompt, &messages, &app, &stream_key).await {
        Ok(result) => {
            let duration_ms = stream_start.elapsed().as_millis() as u64;

            // I2: save output — weekly/priority get timestamped files + frontmatter; others overwrite output.md
            let (out_path, save_content) = if args.tool_name == "ai-pm-weekly" {
                let now = chrono::Local::now();
                let mode = args.mode.as_deref().unwrap_or("detail");
                let filename = format!("周报-{}.md", now.format("%Y-%m-%d-%H%M%S"));
                let frontmatter = format!(
                    "---\ndate: {}\nmode: {}\ninput_tokens: {}\noutput_tokens: {}\nduration_ms: {}\n---\n\n",
                    now.format("%Y-%m-%dT%H:%M:%S"),
                    mode,
                    result.input_tokens.unwrap_or(0),
                    result.output_tokens.unwrap_or(0),
                    duration_ms,
                );
                (tools_dir.join(&filename), format!("{}{}", frontmatter, result.full_text))
            } else if args.tool_name == "ai-pm-priority" {
                let now = chrono::Local::now();
                // count is passed from frontend via mode field as "priority:N"
                let count: u64 = args.mode.as_deref()
                    .and_then(|m| m.strip_prefix("priority:"))
                    .and_then(|n| n.parse().ok())
                    .unwrap_or(0);
                let filename = format!("评估-{}.md", now.format("%Y-%m-%d-%H%M%S"));
                let frontmatter = format!(
                    "---\ndate: {}\ncount: {}\ninput_tokens: {}\noutput_tokens: {}\nduration_ms: {}\n---\n\n",
                    now.format("%Y-%m-%dT%H:%M:%S"),
                    count,
                    result.input_tokens.unwrap_or(0),
                    result.output_tokens.unwrap_or(0),
                    duration_ms,
                );
                (tools_dir.join(&filename), format!("{}{}", frontmatter, result.full_text))
            } else {
                (tools_dir.join("output.md"), result.full_text.clone())
            };
            if let Err(e) = fs::write(&out_path, &save_content) {
                eprintln!("[{}] 写入失败 {:?}: {}", args.tool_name, out_path, e);
            }

            // Additionally save to project context dir if project_id was provided
            if let Some(ref pid) = args.project_id {
                let project_output_dir: Option<String> = {
                    let db = state.db.lock().ok();
                    db.and_then(|db| {
                        db.query_row(
                            "SELECT output_dir FROM projects WHERE id = ?1",
                            rusqlite::params![pid],
                            |row| row.get(0),
                        ).ok()
                    })
                };
                if let Some(output_dir) = project_output_dir {
                    let context_dir = Path::new(&output_dir).join("context");
                    let _ = fs::create_dir_all(&context_dir);
                    // Short name: strip "ai-pm-" prefix
                    let short_name = args.tool_name.strip_prefix("ai-pm-").unwrap_or(&args.tool_name);
                    let date_str = chrono::Local::now().format("%Y-%m-%d").to_string();
                    let context_file = context_dir.join(format!("{}-{}.md", short_name, date_str));
                    let _ = fs::write(&context_file, &result.full_text);
                }
            }

            let done_payload = serde_json::json!({
                "streamKey": &stream_key,
                "outputFile": out_path.to_string_lossy(),
                "durationMs": duration_ms,
                "inputTokens": result.input_tokens,
                "outputTokens": result.output_tokens,
                "finalText": result.full_text,
            });
            let _ = app.emit("stream_done", done_payload);
        }
        Err(e) => {
            let _ = app.emit("stream_error", serde_json::json!({ "streamKey": &stream_key, "message": &e }));
        }
    }

    Ok(())
}

/// Fetch a URL and return plain text (HTML stripped, truncated to 8 000 chars).
#[tauri::command]
pub async fn fetch_url_content(url: String) -> Result<String, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("仅支持 http/https URL".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("Mozilla/5.0 (compatible; AI-PM-Research/1.0)")
        .build()
        .map_err(|e| e.to_string())?;

    let html = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("请求失败：{}", e))?
        .text()
        .await
        .map_err(|e| format!("读取响应失败：{}", e))?;

    let text = strip_html(html);
    let truncated = if text.chars().count() > 8000 {
        let cutoff = text.char_indices().nth(8000).map(|(i, _)| i).unwrap_or(text.len());
        format!("{}…（内容已截断）", &text[..cutoff])
    } else {
        text
    };
    Ok(truncated)
}

// ─── Weekly report history ─────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyReportMeta {
    pub filename: String,
    pub date: String,
    pub mode: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub duration_ms: u64,
}

/// Parse YAML-like frontmatter from tool output files.
/// Format: "---\nkey: value\n...\n---\n\nbody"
/// Returns (field_map, body_start_offset). Keys/values are trimmed strings.
/// split_once(':') splits at first colon only — safe for ISO date values containing colons.
fn parse_tool_frontmatter(content: &str) -> Option<(std::collections::HashMap<String, String>, usize)> {
    if !content.starts_with("---\n") {
        return None;
    }
    let end = content[4..].find("\n---")?;
    let fm_block = &content[4..4 + end];
    let mut fields = std::collections::HashMap::new();
    for line in fm_block.lines() {
        if let Some((key, val)) = line.split_once(':') {
            fields.insert(key.trim().to_string(), val.trim().to_string());
        }
    }
    // Body starts after "---\n" (4) + fm_block (end) + "\n---\n" (5)
    let raw_body_start = 4 + end + 5;
    let body_start = content[raw_body_start..]
        .find(|c: char| c != '\n')
        .map(|i| raw_body_start + i)
        .unwrap_or(raw_body_start);
    Some((fields, body_start))
}

/// Helper to extract a u64 from frontmatter HashMap.
fn fm_u64(fm: &std::collections::HashMap<String, String>, key: &str) -> u64 {
    fm.get(key).and_then(|v| v.parse().ok()).unwrap_or(0)
}

/// Helper to extract a String from frontmatter HashMap.
fn fm_str(fm: &std::collections::HashMap<String, String>, key: &str) -> String {
    fm.get(key).cloned().unwrap_or_default()
}

#[tauri::command]
pub fn list_weekly_reports(
    state: State<'_, AppState>,
) -> Result<Vec<WeeklyReportMeta>, String> {
    let tools_dir = Path::new(&state.projects_dir).join("tools").join("ai-pm-weekly");
    if !tools_dir.exists() {
        return Ok(vec![]);
    }
    let mut reports: Vec<WeeklyReportMeta> = Vec::new();
    let entries = fs::read_dir(&tools_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with("周报-") || !name.ends_with(".md") {
            continue;
        }
        // Only read first 512 bytes for frontmatter parsing (performance)
        let path = entry.path();
        let content = match fs::File::open(&path) {
            Ok(f) => {
                use std::io::Read;
                let mut buf = vec![0u8; 512];
                let mut reader = std::io::BufReader::new(f);
                let n = reader.read(&mut buf).unwrap_or(0);
                String::from_utf8_lossy(&buf[..n]).to_string()
            }
            Err(_) => continue,
        };
        if let Some((fm, _)) = parse_tool_frontmatter(&content) {
            reports.push(WeeklyReportMeta {
                filename: name,
                date: fm_str(&fm, "date"),
                mode: fm_str(&fm, "mode"),
                input_tokens: fm_u64(&fm, "input_tokens"),
                output_tokens: fm_u64(&fm, "output_tokens"),
                duration_ms: fm_u64(&fm, "duration_ms"),
            });
        }
    }
    // Sort by date descending (newest first)
    reports.sort_by(|a, b| b.date.cmp(&a.date));
    Ok(reports)
}

#[tauri::command]
pub fn get_weekly_report(
    state: State<'_, AppState>,
    filename: String,
) -> Result<String, String> {
    // C1: prevent path traversal
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("非法文件名".to_string());
    }
    let path = Path::new(&state.projects_dir)
        .join("tools").join("ai-pm-weekly").join(&filename);
    let content = fs::read_to_string(&path).map_err(|e| format!("读取失败：{}", e))?;
    // Strip frontmatter, return body only
    if let Some((_, body_start)) = parse_tool_frontmatter(&content) {
        Ok(content[body_start..].to_string())
    } else {
        Ok(content)
    }
}

#[tauri::command]
pub fn delete_weekly_report(
    state: State<'_, AppState>,
    filename: String,
) -> Result<(), String> {
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("非法文件名".to_string());
    }
    let path = Path::new(&state.projects_dir)
        .join("tools").join("ai-pm-weekly").join(&filename);
    fs::remove_file(&path).map_err(|e| format!("删除失败：{}", e))
}

// ─── Priority report history ──────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PriorityReportMeta {
    pub filename: String,
    pub date: String,
    pub count: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub duration_ms: u64,
}

#[tauri::command]
pub async fn list_priority_reports(
    state: State<'_, AppState>,
    keyword: Option<String>,
) -> Result<Vec<PriorityReportMeta>, String> {
    let projects_dir = state.projects_dir.clone();
    let kw = keyword.clone();

    // Run file I/O in blocking thread to avoid blocking the event loop (review #5)
    tokio::task::spawn_blocking(move || {
        let tools_dir = Path::new(&projects_dir).join("tools").join("ai-pm-priority");
        if !tools_dir.exists() {
            return Ok(vec![]);
        }
        let mut reports: Vec<PriorityReportMeta> = Vec::new();
        let entries = fs::read_dir(&tools_dir).map_err(|e| e.to_string())?;
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with("评估-") || !name.ends_with(".md") {
                continue;
            }
            let path = entry.path();

            if let Some(ref kw) = kw {
                // Keyword search: read full content, check contains
                let content = match fs::read_to_string(&path) {
                    Ok(c) => c,
                    Err(_) => continue,
                };
                if !content.contains(kw.as_str()) {
                    continue;
                }
                if let Some((fm, _)) = parse_tool_frontmatter(&content) {
                    reports.push(PriorityReportMeta {
                        filename: name,
                        date: fm_str(&fm, "date"),
                        count: fm_u64(&fm, "count"),
                        input_tokens: fm_u64(&fm, "input_tokens"),
                        output_tokens: fm_u64(&fm, "output_tokens"),
                        duration_ms: fm_u64(&fm, "duration_ms"),
                    });
                }
            } else {
                // No keyword: only read first 512 bytes for frontmatter
                let content = match fs::File::open(&path) {
                    Ok(f) => {
                        use std::io::Read;
                        let mut buf = vec![0u8; 512];
                        let mut reader = std::io::BufReader::new(f);
                        let n = reader.read(&mut buf).unwrap_or(0);
                        String::from_utf8_lossy(&buf[..n]).to_string()
                    }
                    Err(_) => continue,
                };
                if let Some((fm, _)) = parse_tool_frontmatter(&content) {
                    reports.push(PriorityReportMeta {
                        filename: name,
                        date: fm_str(&fm, "date"),
                        count: fm_u64(&fm, "count"),
                        input_tokens: fm_u64(&fm, "input_tokens"),
                        output_tokens: fm_u64(&fm, "output_tokens"),
                        duration_ms: fm_u64(&fm, "duration_ms"),
                    });
                }
            }
        }
        reports.sort_by(|a, b| b.date.cmp(&a.date));
        Ok(reports)
    })
    .await
    .map_err(|e| format!("spawn_blocking failed: {}", e))?
}

#[tauri::command]
pub fn get_priority_report(
    state: State<'_, AppState>,
    filename: String,
) -> Result<String, String> {
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("非法文件名".to_string());
    }
    let path = Path::new(&state.projects_dir)
        .join("tools").join("ai-pm-priority").join(&filename);
    let content = fs::read_to_string(&path).map_err(|e| format!("读取失败：{}", e))?;
    if let Some((_, body_start)) = parse_tool_frontmatter(&content) {
        Ok(content[body_start..].to_string())
    } else {
        Ok(content)
    }
}

#[tauri::command]
pub fn delete_priority_report(
    state: State<'_, AppState>,
    filename: String,
) -> Result<(), String> {
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("非法文件名".to_string());
    }
    let path = Path::new(&state.projects_dir)
        .join("tools").join("ai-pm-priority").join(&filename);
    fs::remove_file(&path).map_err(|e| format!("删除失败：{}", e))
}

fn strip_html(html: String) -> String {
    let mut out = String::with_capacity(html.len() / 2);
    let mut in_tag = false;
    let mut skip_block = false;

    // We iterate by char index; maintain a byte position to enable cheap prefix checks
    let chars: Vec<char> = html.chars().collect();
    let lower: Vec<char> = html.to_lowercase().chars().collect();
    let len = chars.len();
    let mut i = 0;

    // Helper: check if lower[i..] starts with a string literal (char-by-char)
    let starts_with = |lower: &Vec<char>, i: usize, pat: &str| -> bool {
        let pat_chars: Vec<char> = pat.chars().collect();
        if i + pat_chars.len() > lower.len() {
            return false;
        }
        lower[i..i + pat_chars.len()].iter().zip(pat_chars.iter()).all(|(a, b)| a == b)
    };

    while i < len {
        // Detect start of <script>/<style> blocks
        if !skip_block && !in_tag {
            if starts_with(&lower, i, "<script") || starts_with(&lower, i, "<style") {
                skip_block = true;
            }
        }
        // Detect end of script/style blocks
        if skip_block {
            if starts_with(&lower, i, "</script>") {
                skip_block = false;
                i += 9; // "</script>" = 9 chars
                continue;
            }
            if starts_with(&lower, i, "</style>") {
                skip_block = false;
                i += 8; // "</style>" = 8 chars
                continue;
            }
            i += 1;
            continue;
        }
        match chars[i] {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                out.push(' ');
            }
            c if !in_tag => out.push(c),
            _ => {}
        }
        i += 1;
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}
