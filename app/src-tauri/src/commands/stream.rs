use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Emitter, State};
use crate::state::AppState;
use crate::commands::config::read_config_internal;

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

// Phase → (skill_name, input_files[], output_file)
fn phase_config(phase: &str) -> Option<(&'static str, &'static [&'static str], &'static str)> {
    match phase {
        "requirement" => Some(("ai-pm", &[], "01-requirement-draft.md")),
        "analysis" => Some(("ai-pm-analyze", &["01-requirement-draft.md"], "02-analysis-report.md")),
        "research" => Some(("ai-pm-research", &["01-requirement-draft.md", "02-analysis-report.md"], "03-competitor-report.md")),
        "stories" => Some(("ai-pm-story", &["02-analysis-report.md", "03-competitor-report.md"], "04-user-stories.md")),
        "prd" => Some(("ai-pm-prd", &["02-analysis-report.md", "03-competitor-report.md", "04-user-stories.md"], "05-prd/05-PRD-v1.0.md")),
        "prototype" => Some(("ai-pm-prototype", &["05-prd/05-PRD-v1.0.md"], "06-prototype.html")),
        "review" => Some(("ai-pm-review", &["05-prd/05-PRD-v1.0.md"], "07-review-report.md")),
        _ => None,
    }
}

fn load_skill(ai_pm_root: &str, skill_name: &str) -> Result<String, String> {
    let skill_dir = Path::new(ai_pm_root).join(".claude").join("skills").join(skill_name);
    let entry = skill_dir.join("SKILL.md");

    if !entry.exists() {
        return Err(format!("Skill not found: {} (looked in {})", skill_name, skill_dir.display()));
    }

    let mut files: Vec<String> = fs::read_dir(&skill_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|f| f.ends_with(".md"))
        .collect();

    // SKILL.md first, then alphabetical
    files.retain(|f| f != "SKILL.md");
    files.sort();

    let mut sections = Vec::new();

    // SKILL.md content
    let main_content = fs::read_to_string(&entry).map_err(|e| e.to_string())?;
    sections.push(main_content);

    // Sub-files
    for file in files {
        let path = skill_dir.join(&file);
        if let Ok(content) = fs::read_to_string(&path) {
            let label = file.trim_end_matches(".md");
            sections.push(format!("\n<!-- sub-file: {} -->\n{}", label, content));
        }
    }

    Ok(sections.join("\n"))
}

fn build_system_prompt(
    ai_pm_root: &str,
    output_dir: &str,
    project_name: &str,
    skill_name: &str,
    input_files: &[&str],
    user_input: Option<&str>,
) -> Result<String, String> {
    let skill_content = load_skill(ai_pm_root, skill_name)?;

    let mut parts = vec![skill_content];

    // Project context
    let mut ctx = vec![
        String::new(),
        "---".to_string(),
        String::new(),
        "## 当前项目上下文".to_string(),
        String::new(),
        format!("- 项目名称：{}", project_name),
    ];

    // Previous outputs
    let previous_outputs: Vec<(String, String)> = input_files.iter()
        .filter_map(|filename| {
            let path = Path::new(output_dir).join(filename);
            fs::read_to_string(&path).ok().map(|c| (filename.to_string(), c))
        })
        .collect();

    if !previous_outputs.is_empty() {
        ctx.push(String::new());
        ctx.push("### 已有产出物".to_string());
        ctx.push(String::new());
        for (filename, content) in &previous_outputs {
            ctx.push(format!("#### {}", filename));
            ctx.push(String::new());
            ctx.push("```".to_string());
            ctx.push(content.clone());
            ctx.push("```".to_string());
            ctx.push(String::new());
        }
    }

    if let Some(input) = user_input {
        ctx.push(String::new());
        ctx.push("### 用户输入".to_string());
        ctx.push(String::new());
        ctx.push(input.to_string());
    }

    parts.push(ctx.join("\n"));

    Ok(parts.join("\n"))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartStreamArgs {
    pub project_id: String,
    pub phase: String,
    pub messages: Vec<ChatMessage>,
}

#[tauri::command]
pub async fn start_stream(
    app: AppHandle,
    state: State<'_, AppState>,
    args: StartStreamArgs,
) -> Result<(), String> {
    let (project_name, output_dir) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let result = db.query_row(
            "SELECT name, output_dir FROM projects WHERE id = ?1",
            params![&args.project_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        ).map_err(|e| format!("Project not found: {}", e))?;
        result
    };

    let (skill_name, input_files, output_file) = phase_config(&args.phase)
        .ok_or_else(|| format!("Unknown phase: {}", args.phase))?;

    let last_user_msg = args.messages.iter().rev()
        .find(|m| m.role == "user")
        .map(|m| m.content.as_str());

    let system_prompt = build_system_prompt(
        &state.ai_pm_root,
        &output_dir,
        &project_name,
        skill_name,
        input_files,
        last_user_msg,
    ).map_err(|e| {
        let _ = app.emit("stream_error", &e);
        e
    })?;

    let config = read_config_internal(&state.config_dir)
        .ok_or_else(|| {
            let msg = "API 未配置 — 请前往「设置」页面填写 API Key 后重试。".to_string();
            let _ = app.emit("stream_error", &msg);
            msg
        })?;

    let base_url = config.base_url
        .unwrap_or_else(|| "https://api.anthropic.com".to_string());
    let api_key = config.api_key.unwrap_or_default();

    let client = reqwest::Client::new();
    let url = format!("{}/v1/messages", base_url.trim_end_matches('/'));

    let messages_json: Vec<serde_json::Value> = args.messages.iter().map(|m| {
        serde_json::json!({"role": m.role, "content": m.content})
    }).collect();

    let body = serde_json::json!({
        "model": config.model,
        "max_tokens": 8192,
        "stream": true,
        "system": system_prompt,
        "messages": messages_json,
    });

    let mut resp = client
        .post(&url)
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            let msg = format!("HTTP error: {}", e);
            let _ = app.emit("stream_error", &msg);
            msg
        })?;

    if !resp.status().is_success() {
        let err_body = resp.text().await.unwrap_or_default();
        let msg = format!("API error: {}", err_body);
        let _ = app.emit("stream_error", &msg);
        return Ok(());
    }

    let mut full_text = String::new();
    let mut buffer = String::new();

    while let Some(chunk) = resp.chunk().await.map_err(|e| {
        let msg = format!("Stream read error: {}", e);
        let _ = app.emit("stream_error", &msg);
        msg
    })? {
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        // Process complete SSE messages (separated by \n\n)
        loop {
            if let Some(pos) = buffer.find("\n\n") {
                let event_str = buffer[..pos].to_string();
                buffer = buffer[pos + 2..].to_string();

                for line in event_str.lines() {
                    if let Some(data) = line.strip_prefix("data: ") {
                        if data == "[DONE]" { continue; }
                        if let Ok(event) = serde_json::from_str::<serde_json::Value>(data) {
                            if event["type"] == "content_block_delta" {
                                if let Some(text) = event["delta"]["text"].as_str() {
                                    full_text.push_str(text);
                                    let _ = app.emit("stream_chunk", text);
                                }
                            }
                        }
                    }
                }
            } else {
                break;
            }
        }
    }

    // Save output file
    let file_path = Path::new(&output_dir).join(output_file);
    if let Some(parent) = file_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(&file_path, &full_text);

    let _ = app.emit("stream_done", output_file);

    Ok(())
}
