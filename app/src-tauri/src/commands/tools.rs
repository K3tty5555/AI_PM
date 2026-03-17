use serde::Deserialize;
use std::fs;
use std::path::Path;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager, State};
use crate::state::AppState;
use crate::commands::config::{read_config_internal, Backend};
use crate::commands::stream::ChatMessage;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunToolArgs {
    pub tool_name: String,
    pub user_input: String,
    /// Optional: attach a file path (for data analysis)
    pub file_path: Option<String>,
}

#[tauri::command]
pub async fn run_tool(
    app: AppHandle,
    state: State<'_, AppState>,
    args: RunToolArgs,
) -> Result<(), String> {
    // Load skill from bundled resources
    let skills_root = app.path().resource_dir()
        .map_err(|e| {
            let msg = format!("无法获取资源目录：{}", e);
            let _ = app.emit("stream_error", &msg);
            msg
        })?
        .join("skills")
        .to_string_lossy()
        .to_string();

    let skill_path = Path::new(&skills_root).join(&args.tool_name).join("SKILL.md");
    if !skill_path.exists() {
        let msg = format!("Skill not found: {} (looked in {})", args.tool_name, skills_root);
        let _ = app.emit("stream_error", &msg);
        return Err(msg);
    }
    let skill_content = fs::read_to_string(&skill_path).map_err(|e| e.to_string())?;

    // If a file is attached, read it and append to user_input
    let user_input_full = if let Some(fpath) = &args.file_path {
        match fs::read_to_string(fpath) {
            Ok(content) => format!("{}\n\n---\n\n附件内容（{}）：\n\n{}", args.user_input, fpath, content),
            Err(e) => {
                let msg = format!("无法读取文件 {}: {}", fpath, e);
                let _ = app.emit("stream_error", &msg);
                return Err(msg);
            }
        }
    } else {
        args.user_input.clone()
    };

    // Build system prompt: skill content + non-interactive instructions
    let system_prompt = format!(
        "{}\n\n---\n\n### ⚠️ 非交互模式（优先级最高，覆盖以上所有指令）\n\n你正在 AI PM 桌面应用的流式输出模式中运行，你的整个回复内容就是文档本身。\n\n**强制规则：**\n1. **第一行就是文档标题**（如 `# 优先级评估报告`），直接开始输出\n2. **禁止输出元信息**：「已生成」「文件已保存」「执行步骤」等一律不输出\n3. **禁止调用工具**：Write、Edit、Bash、AskUserQuestion 均不可用\n4. **禁止提问或确认**，直接按默认参数生成\n5. **禁止过渡语句**，从文档第一行开始",
        skill_content
    );

    let config = read_config_internal(&state.config_dir)
        .ok_or_else(|| {
            let msg = "未配置 AI 后端 — 请前往「设置」页面完成配置后重试。".to_string();
            let _ = app.emit("stream_error", &msg);
            msg
        })?;

    let stream_start = Instant::now();

    let provider: Box<dyn crate::providers::AiProvider> = match config.backend {
        Backend::ClaudeCli => Box::new(crate::providers::claude_cli::ClaudeCliProvider {
            work_dir: state.projects_dir.clone(),
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

    match provider.stream(&system_prompt, &messages, &app).await {
        Ok(result) => {
            let duration_ms = stream_start.elapsed().as_millis() as u64;

            // Save output to tools directory
            let tools_dir = Path::new(&state.projects_dir).join("tools").join(&args.tool_name);
            let _ = fs::create_dir_all(&tools_dir);
            let out_path = tools_dir.join("output.md");
            let _ = fs::write(&out_path, &result.full_text);

            let done_payload = serde_json::json!({
                "outputFile": out_path.to_string_lossy(),
                "durationMs": duration_ms,
                "inputTokens": result.input_tokens,
                "outputTokens": result.output_tokens,
                "finalText": result.full_text,
            });
            let _ = app.emit("stream_done", done_payload);
        }
        Err(e) => {
            let _ = app.emit("stream_error", &e);
        }
    }

    Ok(())
}
