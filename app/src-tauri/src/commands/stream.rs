use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager, State};
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

pub fn load_skill(skills_root: &str, skill_name: &str) -> Result<String, String> {
    let skill_dir = Path::new(skills_root).join(skill_name);
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

fn load_knowledge(config_dir: &str) -> String {
    let kb_dir = Path::new(config_dir).join("knowledge");
    if !kb_dir.exists() {
        return String::new();
    }

    let mut category_blocks: Vec<String> = Vec::new();

    let mut categories: Vec<_> = fs::read_dir(&kb_dir)
        .map(|rd| rd.filter_map(|e| e.ok()).collect())
        .unwrap_or_default();
    categories.sort_by_key(|e| e.file_name());

    for cat_entry in categories {
        let cat_path = cat_entry.path();
        if !cat_path.is_dir() {
            continue;
        }
        let cat_name = cat_entry.file_name().to_string_lossy().to_string();

        let mut entries: Vec<String> = Vec::new();
        if let Ok(files) = fs::read_dir(&cat_path) {
            let mut file_entries: Vec<_> = files.filter_map(|e| e.ok()).collect();
            file_entries.sort_by_key(|e| e.file_name());
            for file_entry in file_entries {
                let fp = file_entry.path();
                if fp.extension().and_then(|e| e.to_str()) != Some("md") {
                    continue;
                }
                if let Ok(content) = fs::read_to_string(&fp) {
                    let trimmed = content.trim().to_string();
                    if !trimmed.is_empty() {
                        entries.push(trimmed);
                    }
                }
            }
        }

        if !entries.is_empty() {
            category_blocks.push(format!(
                "#### {}\n\n{}",
                cat_name,
                entries.join("\n\n---\n\n")
            ));
        }
    }

    if category_blocks.is_empty() {
        return String::new();
    }

    format!(
        "\n\n---\n\n### 产品知识库\n\n{}\n",
        category_blocks.join("\n\n")
    )
}

fn load_context_files(output_dir: &str, excluded: &[String]) -> String {
    let context_dir = Path::new(output_dir).join("context");
    if !context_dir.exists() {
        return String::new();
    }

    let mut file_entries: Vec<_> = fs::read_dir(&context_dir)
        .map(|rd| rd.filter_map(|e| e.ok()).collect())
        .unwrap_or_default();
    file_entries.sort_by_key(|e| e.file_name());

    let mut blocks: Vec<String> = Vec::new();
    for entry in file_entries {
        let fp = entry.path();
        if !fp.is_file() {
            continue;
        }
        if fp.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if excluded.contains(&name) {
            continue;
        }
        if let Ok(content) = fs::read_to_string(&fp) {
            let trimmed = content.trim().to_string();
            if !trimmed.is_empty() {
                blocks.push(format!("#### {}\n\n{}", name, trimmed));
            }
        }
    }

    if blocks.is_empty() {
        return String::new();
    }

    format!(
        "### 工具上下文\n\n{}\n",
        blocks.join("\n\n---\n\n")
    )
}

fn build_system_prompt(
    skills_root: &str,
    output_dir: &str,
    project_name: &str,
    skill_name: &str,
    input_files: &[&str],
    user_input: Option<&str>,
    team_mode: bool,
    phase: &str,
    config_dir: &str,
    excluded_context: &[String],
) -> Result<String, String> {
    let skill_content = load_skill(skills_root, skill_name)?;

    let mut parts = vec![skill_content];

    // Inject knowledge base entries (if any)
    let knowledge = load_knowledge(config_dir);
    if !knowledge.is_empty() {
        parts[0].push_str(&knowledge);
    }

    // Context files injection (tool outputs bound to this project)
    let context_block = load_context_files(output_dir, excluded_context);
    if !context_block.is_empty() {
        parts[0].push_str("\n\n---\n\n");
        parts[0].push_str(&context_block);
    }

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

    // Team mode: inject --team marker before non-interactive block
    if team_mode {
        ctx.push(String::new());
        ctx.push("### 多代理协作模式（--team）".to_string());
        ctx.push(String::new());
        ctx.push("本次以 `--team` 模式运行：按技能说明中的多代理协作路径执行，产出更全面深入。".to_string());
    }

    // Non-interactive mode hint — must come last so it overrides skill instructions
    ctx.push(String::new());
    ctx.push("---".to_string());
    ctx.push(String::new());
    ctx.push("### ⚠️ 非交互模式（优先级最高，覆盖以上所有指令）".to_string());
    ctx.push(String::new());
    ctx.push("你正在 **AI PM 桌面应用的流式输出模式**中运行，你的整个回复内容就是文档本身。".to_string());
    ctx.push(String::new());
    ctx.push("**强制规则（逐条执行）：**".to_string());

    if phase == "prototype" {
        ctx.push("1. **你的整个输出就是 HTML 文件本身**：第一行必须是 `<!DOCTYPE html>`，最后一行必须是 `</html>`，中间是完整的单文件 HTML+CSS+JS，不要任何前言或后记".to_string());
        ctx.push("2. **禁止输出元信息**：「已生成」「文件已保存」「截图」「manifest」「步骤」等一律不输出".to_string());
        ctx.push("3. **严禁调用任何工具**：Write、Edit、Bash、AskUserQuestion、Read 在此环境中不存在且无法执行。\
            你不需要用 Write 保存文件——后端会自动把你的输出流保存为 HTML 文件。\
            **如果你想调用工具，请直接跳过，把文件内容输出到 stdout 即可。**\
            绝对不要输出「需要您批准」「请批准 Write 工具」「等待权限」等字样。".to_string());
        ctx.push("4. **禁止提问或确认**：设计规范默认 AI 情境定制，直接生成完整 HTML 原型。".to_string());
        ctx.push("5. **禁止过渡语句**：不要输出「好的我来生成」「首先我会」等，直接从 `<!DOCTYPE html>` 开始。".to_string());
    } else {
        ctx.push("1. **第一行就是文档标题**（如 `# PRD：产品名`），最后一行是文档结尾，不要有任何前言或后记".to_string());
        ctx.push("2. **禁止输出元信息**：「已生成」「文件已保存」「执行步骤」「操作结果」「PRD 已完成」等一律不输出".to_string());
        ctx.push("3. **禁止调用任何工具**：Write、Edit、Bash、AskUserQuestion 在此环境中均不存在，调用无效。\
            你不需要用 Write 保存文件——后端会自动把你的输出流保存为文件。\
            **绝对不要输出「需要您批准」「请批准 Write 工具」「等待权限」等字样。**".to_string());
        ctx.push("4. **禁止提问或确认**：导出格式默认「仅 Markdown」，用户故事按标准编写，直接生成内容".to_string());
        ctx.push("5. **禁止过渡语句**：不要输出「好的我来生成」「首先我会」等，直接从文档第一行开始".to_string());
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
    pub excluded_context: Option<Vec<String>>,
}

#[tauri::command]
pub async fn start_stream(
    app: AppHandle,
    state: State<'_, AppState>,
    args: StartStreamArgs,
) -> Result<(), String> {
    let (project_name, output_dir, team_mode) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let result = db.query_row(
            "SELECT name, output_dir, COALESCE(team_mode, 0) FROM projects WHERE id = ?1",
            params![&args.project_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?)),
        ).map_err(|e| format!("Project not found: {}", e))?;
        result
    };
    let team_mode = team_mode != 0;
    let config_dir = state.config_dir.clone();
    let excluded_context = args.excluded_context.unwrap_or_default();

    let (skill_name, input_files, output_file) = phase_config(&args.phase)
        .ok_or_else(|| format!("Unknown phase: {}", args.phase))?;

    let last_user_msg = args.messages.iter().rev()
        .find(|m| m.role == "user")
        .map(|m| m.content.as_str());

    // Resolve bundled skills directory from app resources
    let skills_root = app.path().resource_dir()
        .map_err(|e| {
            let msg = format!("无法获取资源目录：{}", e);
            let _ = app.emit("stream_error", &msg);
            msg
        })?
        .join("skills")
        .to_string_lossy()
        .to_string();

    let system_prompt = build_system_prompt(
        &skills_root,
        &output_dir,
        &project_name,
        skill_name,
        input_files,
        last_user_msg,
        team_mode,
        &args.phase,
        &config_dir,
        &excluded_context,
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
            Box::new(crate::providers::claude_cli::ClaudeCliProvider {
                work_dir: output_dir.clone(),
            })
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

            // In CLI mode, the AI may use Write tool to write the document directly to
            // disk while only outputting a short confirmation message to stdout.
            // Detect this: if stdout is short but disk already has substantial content,
            // preserve the disk file and use it as the final text for the frontend.
            let final_text = if result.full_text.trim().len() < 400 {
                let disk_content = fs::read_to_string(&file_path).unwrap_or_default();
                if disk_content.trim().len() > result.full_text.trim().len() + 200 {
                    // AI wrote real content via Write tool — keep it as-is on disk
                    disk_content
                } else {
                    let _ = fs::write(&file_path, &result.full_text);
                    result.full_text
                }
            } else {
                let _ = fs::write(&file_path, &result.full_text);
                result.full_text
            };

            let done_payload = serde_json::json!({
                "outputFile": output_file,
                "durationMs": duration_ms,
                "inputTokens": result.input_tokens,
                "outputTokens": result.output_tokens,
                "finalText": final_text,
            });
            let _ = app.emit("stream_done", done_payload);
        }
        Err(e) => {
            let _ = app.emit("stream_error", &e);
        }
    }

    Ok(())
}
