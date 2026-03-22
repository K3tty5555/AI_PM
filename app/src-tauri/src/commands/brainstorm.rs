use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Emitter, State};

use crate::commands::config::{read_config_internal, Backend};
use crate::commands::stream::{ChatMessage, resolve_skills_root, load_skill, load_knowledge, phase_config};
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

    // 0. Round limit check
    if args.messages.len() > 40 {
        let msg = "ROUND_LIMIT_EXCEEDED";
        let _ = app.emit("stream_error", serde_json::json!({ "streamKey": &stream_key, "message": msg }));
        return Err("对话轮次已达上限".to_string());
    }

    // 1. Query project info from DB
    let (_project_name, output_dir) = {
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

    // 3. Load skill file
    let skills_root = resolve_skills_root(&app)?;
    let skill_content = load_skill(&skills_root, "ai-pm-brainstorm")
        .map_err(|e| {
            let msg = format!("加载头脑风暴技能失败: {e}");
            let _ = app.emit("stream_error", serde_json::json!({ "streamKey": &stream_key, "message": &msg }));
            msg
        })?;

    // 4. Phase hint
    let phase_hint = match args.phase.as_str() {
        "analysis" => "\n\n---\n\n当前阶段：需求分析。重点讨论：要解决什么问题、目标用户、核心痛点、需求边界",
        "stories" => "\n\n---\n\n当前阶段：用户故事。重点讨论：关键场景、用户行为、验收标准、优先级",
        "prd" => "\n\n---\n\n当前阶段：PRD 撰写。重点讨论：功能设计、技术约束、优先级取舍、MVP 范围",
        _ => "",
    };

    // 5. Read prior outputs from phase_config input_files
    let mut prior_outputs = String::new();
    if let Some((_skill, input_files, _output, _companions)) = phase_config(&args.phase) {
        let mut blocks: Vec<String> = Vec::new();
        for filename in input_files {
            let path = Path::new(&output_dir).join(filename);
            if let Ok(content) = fs::read_to_string(&path) {
                let trimmed = content.trim().to_string();
                if !trimmed.is_empty() {
                    blocks.push(format!("#### {}\n\n```\n{}\n```", filename, trimmed));
                }
            }
        }
        if !blocks.is_empty() {
            prior_outputs = format!(
                "\n\n---\n\n## 已有产出物（仅供参考，不要原样复述）\n\n{}",
                blocks.join("\n\n")
            );
        }
    }

    // 6. Knowledge base
    let templates_base = state.templates_base();
    let knowledge = load_knowledge(&templates_base);

    // 7. Assemble system prompt
    let system_prompt = format!("{}{}\n\n{}\n\n{}", skill_content, phase_hint, prior_outputs, knowledge);

    // 8. Create provider
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

    // 9. Stream
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
