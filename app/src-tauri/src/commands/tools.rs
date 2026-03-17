use serde::Deserialize;
use std::fs;
use std::path::Path;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager, State};
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
}

#[tauri::command]
pub async fn run_tool(
    app: AppHandle,
    state: State<'_, AppState>,
    args: RunToolArgs,
) -> Result<(), String> {
    // C1: Reject unknown tool names before any path operations
    if !VALID_TOOLS.contains(&args.tool_name.as_str()) {
        let msg = format!("未知工具：{}", args.tool_name);
        let _ = app.emit("stream_error", &msg);
        return Err(msg);
    }

    // Load skill from bundled resources — I1: use shared load_skill (reads all sub-files)
    let skills_root = app.path().resource_dir()
        .map_err(|e| {
            let msg = format!("无法获取资源目录：{}", e);
            let _ = app.emit("stream_error", &msg);
            msg
        })?
        .join("skills")
        .to_string_lossy()
        .to_string();

    // I1: Replace manual SKILL.md read with shared load_skill that also loads sub-files.
    // I3: map_err emits stream_error before returning, satisfying Fix I3.
    let skill_content = crate::commands::stream::load_skill(&skills_root, &args.tool_name)
        .map_err(|e| {
            let _ = app.emit("stream_error", &e);
            e
        })?;

    // If a file is attached, read it and append to user_input
    let user_input_full = if let Some(fpath) = &args.file_path {
        // C2: Canonicalize and verify path is under projects_dir
        let canonical = std::fs::canonicalize(fpath)
            .map_err(|e| {
                let msg = format!("无法解析文件路径 {}: {}", fpath, e);
                let _ = app.emit("stream_error", &msg);
                msg
            })?;

        let projects_canonical = std::fs::canonicalize(&state.projects_dir)
            .unwrap_or_else(|_| Path::new(&state.projects_dir).to_path_buf());

        if !canonical.starts_with(&projects_canonical) {
            let msg = format!("文件路径超出允许范围：{}", fpath);
            let _ = app.emit("stream_error", &msg);
            return Err(msg);
        }

        match fs::read_to_string(&canonical) {
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
    // Rules kept consistent with stream.rs build_system_prompt (same 5 rules, same wording)
    let system_prompt = format!(
        "{}\n\n---\n\n### ⚠️ 非交互模式（优先级最高，覆盖以上所有指令）\n\n你正在 **AI PM 桌面应用的流式输出模式**中运行，你的整个回复内容就是文档本身。\n\n**强制规则（逐条执行）：**\n1. **第一行就是文档标题**（如 `# PRD：产品名`），最后一行是文档结尾，不要有任何前言或后记\n2. **禁止输出元信息**：「已生成」「文件已保存」「执行步骤」「操作结果」「PRD 已完成」等一律不输出\n3. **禁止调用任何工具**：Write、Edit、Bash、AskUserQuestion 在此环境中均不存在，调用无效\n4. **禁止提问或确认**：导出格式默认「仅 Markdown」，用户故事按标准编写，直接生成内容\n5. **禁止过渡语句**：不要输出「好的我来生成」「首先我会」等，直接从文档第一行开始",
        skill_content
    );

    let config = read_config_internal(&state.config_dir)
        .ok_or_else(|| {
            let msg = "未配置 AI 后端 — 请前往「设置」页面完成配置后重试。".to_string();
            let _ = app.emit("stream_error", &msg);
            msg
        })?;

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

    match provider.stream(&system_prompt, &messages, &app).await {
        Ok(result) => {
            let duration_ms = stream_start.elapsed().as_millis() as u64;

            // I2: tools_dir already computed above; save output there
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
