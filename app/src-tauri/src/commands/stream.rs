use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::Instant;
use tauri::{AppHandle, Emitter, State};
use crate::state::AppState;
use crate::commands::config::{read_config_internal, Backend};

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
            let msg = "未配置 AI 后端 — 请前往「设置」页面完成配置后重试。".to_string();
            let _ = app.emit("stream_error", &msg);
            msg
        })?;

    let stream_start = Instant::now();

    // 选择 provider
    let provider: Box<dyn crate::providers::AiProvider> = match config.backend {
        Backend::ClaudeCli => {
            Box::new(crate::providers::claude_cli::ClaudeCliProvider)
        }
        Backend::Api => {
            let base_url = config.base_url
                .unwrap_or_else(|| "https://api.anthropic.com".to_string());
            let api_key = config.api_key.unwrap_or_default();
            let model = config.model.clone();

            if crate::commands::config::is_anthropic(&base_url, &model) {
                Box::new(crate::providers::anthropic::AnthropicProvider {
                    api_key,
                    base_url,
                    model,
                })
            } else {
                Box::new(crate::providers::openai::OpenAIProvider {
                    api_key,
                    base_url,
                    model,
                })
            }
        }
    };

    // 调用 provider，处理结果
    match provider.stream(&system_prompt, &args.messages, &app).await {
        Ok(result) => {
            let duration_ms = stream_start.elapsed().as_millis() as u64;
            let file_path = Path::new(&output_dir).join(output_file);
            if let Some(parent) = file_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(&file_path, &result.full_text);
            let done_payload = serde_json::json!({
                "outputFile": output_file,
                "durationMs": duration_ms,
                "inputTokens": result.input_tokens,
                "outputTokens": result.output_tokens,
            });
            let _ = app.emit("stream_done", done_payload);
        }
        Err(e) => {
            let _ = app.emit("stream_error", &e);
        }
    }

    Ok(())
}
