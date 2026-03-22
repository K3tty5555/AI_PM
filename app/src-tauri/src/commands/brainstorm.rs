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

    // 4. Brainstorm guidance rules
    parts.push(String::new());
    parts.push("---".to_string());
    parts.push(String::new());
    parts.push("## 头脑风暴模式".to_string());
    parts.push(String::new());
    parts.push("你正在与产品经理进行头脑风暴讨论。请遵循以下规则：".to_string());
    parts.push(String::new());
    parts.push("1. 每次只问一个问题，帮助逐步澄清需求".to_string());
    parts.push("2. 提供选项时优先用选择题（A/B/C），降低用户思考负担".to_string());
    parts.push("3. 回复简洁，不要长篇大论".to_string());
    parts.push("4. 当讨论满足以下条件时，在回复最后单独一行写 [SUGGEST_GENERATE]：".to_string());
    parts.push("   - 至少讨论了 3 轮".to_string());
    parts.push("   - 核心需求已明确".to_string());
    parts.push("   - 没有待解的分歧".to_string());
    parts.push("5. [SUGGEST_GENERATE] 标记会被前端渲染为结构化卡片，不要用其他格式".to_string());

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
