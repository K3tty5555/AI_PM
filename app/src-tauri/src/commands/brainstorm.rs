use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Emitter, State};

use crate::commands::config::{read_config_internal, Backend};
use crate::commands::stream::ChatMessage;
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BrainstormMessage {
    pub id: String,
    pub project_id: String,
    pub phase: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
    pub seq: i64,
}

#[tauri::command]
pub fn load_brainstorm_messages(
    state: State<'_, AppState>,
    project_id: String,
    phase: String,
) -> Result<Vec<BrainstormMessage>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, project_id, phase, role, content, created_at, seq \
             FROM brainstorm_messages \
             WHERE project_id = ?1 AND phase = ?2 \
             ORDER BY seq ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![&project_id, &phase], |row| {
            Ok(BrainstormMessage {
                id: row.get(0)?,
                project_id: row.get(1)?,
                phase: row.get(2)?,
                role: row.get(3)?,
                content: row.get(4)?,
                created_at: row.get(5)?,
                seq: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut messages = Vec::new();
    for row in rows {
        messages.push(row.map_err(|e| e.to_string())?);
    }
    Ok(messages)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveBrainstormMessageArgs {
    pub project_id: String,
    pub phase: String,
    pub role: String,
    pub content: String,
}

#[tauri::command]
pub fn save_brainstorm_message(
    state: State<'_, AppState>,
    args: SaveBrainstormMessageArgs,
) -> Result<BrainstormMessage, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Calculate next seq
    let next_seq: i64 = db
        .query_row(
            "SELECT COALESCE(MAX(seq), 0) + 1 FROM brainstorm_messages \
             WHERE project_id = ?1 AND phase = ?2",
            params![&args.project_id, &args.phase],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let id = format!(
        "bs-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    );

    let now = chrono::Utc::now().to_rfc3339();

    db.execute(
        "INSERT INTO brainstorm_messages (id, project_id, phase, role, content, created_at, seq) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![&id, &args.project_id, &args.phase, &args.role, &args.content, &now, &next_seq],
    )
    .map_err(|e| e.to_string())?;

    Ok(BrainstormMessage {
        id,
        project_id: args.project_id,
        phase: args.phase,
        role: args.role,
        content: args.content,
        created_at: now,
        seq: next_seq,
    })
}

#[tauri::command]
pub fn clear_brainstorm(
    state: State<'_, AppState>,
    project_id: String,
    phase: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "DELETE FROM brainstorm_messages WHERE project_id = ?1 AND phase = ?2",
        params![&project_id, &phase],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn brainstorm_message_count(
    state: State<'_, AppState>,
    project_id: String,
    phase: String,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.query_row(
        "SELECT COUNT(*) FROM brainstorm_messages WHERE project_id = ?1 AND phase = ?2",
        params![&project_id, &phase],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

// ── brainstorm_chat streaming command ────────────────────────────────

/// Phase → list of prior output files to include as context
fn phase_prior_files(phase: &str) -> &'static [&'static str] {
    match phase {
        "requirement" => &[],
        "analysis"    => &["01-requirement-draft.md"],
        "research"    => &["01-requirement-draft.md", "02-analysis-report.md"],
        "stories"     => &["02-analysis-report.md", "03-competitor-report.md"],
        "prd"         => &["02-analysis-report.md", "03-competitor-report.md", "04-user-stories.md"],
        "prototype"   => &["05-prd/05-PRD-v1.0.md"],
        "review"      => &["05-prd/05-PRD-v1.0.md"],
        _             => &[],
    }
}

fn build_brainstorm_system_prompt(
    output_dir: &str,
    project_name: &str,
    phase: &str,
    templates_base: &Path,
) -> String {
    let mut parts: Vec<String> = Vec::new();

    // 1. Role preamble
    parts.push(format!(
        "你是一位资深产品经理，正在与用户就项目「{}」的「{}」阶段进行头脑风暴。",
        project_name, phase
    ));

    // 2. Prior outputs as context
    let prior_files = phase_prior_files(phase);
    let mut prior_blocks: Vec<String> = Vec::new();
    for filename in prior_files {
        let path = Path::new(output_dir).join(filename);
        if let Ok(content) = fs::read_to_string(&path) {
            let trimmed = content.trim().to_string();
            if !trimmed.is_empty() {
                prior_blocks.push(format!("#### {}\n\n```\n{}\n```", filename, trimmed));
            }
        }
    }
    if !prior_blocks.is_empty() {
        parts.push(String::new());
        parts.push("---".to_string());
        parts.push(String::new());
        parts.push("## 已有产出物（仅供参考，不要原样复述）".to_string());
        parts.push(String::new());
        for block in prior_blocks {
            parts.push(block);
            parts.push(String::new());
        }
    }

    // 3. Knowledge base
    let knowledge = crate::commands::stream::load_knowledge(templates_base);
    if !knowledge.is_empty() {
        parts.push(knowledge);
    }

    // 4. Brainstorm guidance rules (client-optimized: convergent, not open-ended)
    parts.push(String::new());
    parts.push("---".to_string());
    parts.push(String::new());
    parts.push("## 对话规则".to_string());
    parts.push(String::new());
    parts.push("你是产品经理的搭档，帮助快速理清想法。目标是在 3-5 轮内收敛出可执行的结论。".to_string());
    parts.push(String::new());
    parts.push("核心原则：".to_string());
    parts.push("- 不要重复已有产出物的内容。用户已经看过了，直接讨论新的、不确定的点".to_string());
    parts.push("- 每轮回复先给出你的判断或建议，再问一个推进性问题。不要只问问题不给观点".to_string());
    parts.push("- 回复控制在 3-5 句话。不要长篇大论，不要列举已知信息".to_string());
    parts.push("- 用户回复很短（如 A、B、好、对）时，直接推进到下一个问题，不要复述用户的选择".to_string());
    parts.push(String::new());
    parts.push("收敛机制：".to_string());
    parts.push("- 第 3 轮起，如果核心问题已澄清，主动总结讨论要点（用 1-3 条要点），然后在回复最后单独一行写 [SUGGEST_GENERATE]".to_string());
    parts.push("- [SUGGEST_GENERATE] 标记会被前端渲染为「开始生成」按钮，不要用其他格式".to_string());
    parts.push("- 即使用户选择「继续讨论」，也要在后续 2 轮内再次尝试收敛".to_string());
    parts.push(String::new());
    parts.push("禁止事项：".to_string());
    parts.push("- 不要问「你想聊哪个方向」这类开放式分类问题——直接从最关键的未决问题开始".to_string());
    parts.push("- 不要复述已有产出物的摘要作为开场白".to_string());
    parts.push("- 不要在每轮都列出 A/B/C/D 选项——只在真正有分歧时用选择题".to_string());

    parts.join("\n")
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrainstormChatArgs {
    pub project_id: String,
    pub phase: String,
    pub messages: Vec<ChatMessage>,
}

#[tauri::command]
pub async fn brainstorm_chat(
    app: AppHandle,
    state: State<'_, AppState>,
    args: BrainstormChatArgs,
) -> Result<(), String> {
    let stream_key = format!("brainstorm:{}:{}", args.project_id, args.phase);

    // 1. Query project info from DB
    let (project_name, output_dir) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT name, output_dir FROM projects WHERE id = ?1",
            params![&args.project_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|e| format!("Project not found: {}", e))?
    };

    // 2. Read config for provider selection
    let config = read_config_internal(&state.config_dir).ok_or_else(|| {
        let msg = "未配置 AI 后端 — 请前往「设置」页面完成配置后重试。".to_string();
        let _ = app.emit("stream_error", serde_json::json!({ "streamKey": &stream_key, "message": &msg }));
        msg
    })?;

    // 3. Build system prompt
    let templates_base = state.templates_base();
    let system_prompt = build_brainstorm_system_prompt(
        &output_dir,
        &project_name,
        &args.phase,
        &templates_base,
    );

    // 4. Create provider
    let provider: Box<dyn crate::providers::AiProvider> = match config.backend {
        Backend::ClaudeCli => {
            Box::new(crate::providers::claude_cli::ClaudeCliProvider {
                work_dir: output_dir.clone(),
            })
        }
        Backend::Api => {
            let base_url = config
                .base_url
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

    // 5. Stream
    match provider
        .stream(&system_prompt, &args.messages, &app, &stream_key)
        .await
    {
        Ok(_result) => {
            let _ = app.emit(
                "stream_done",
                serde_json::json!({ "streamKey": &stream_key }),
            );
        }
        Err(e) => {
            let _ = app.emit(
                "stream_error",
                serde_json::json!({ "streamKey": &stream_key, "message": &e }),
            );
        }
    }

    Ok(())
}
