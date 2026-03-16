use async_trait::async_trait;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use crate::providers::{AiProvider, StreamResult};
use crate::commands::stream::ChatMessage;

pub struct ClaudeCliProvider;

impl ClaudeCliProvider {
    /// 检测 `claude` 是否在 PATH 中，返回版本行或错误信息
    pub async fn check_available() -> Result<String, String> {
        let output = tokio::process::Command::new("claude")
            .arg("--version")
            .env_remove("CLAUDECODE")
            .output()
            .await
            .map_err(|_| "未找到 claude 命令，请先安装 Claude Code：https://claude.ai/code".to_string())?;

        if output.status.success() {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            Ok(if version.is_empty() { "claude (已安装)".to_string() } else { version })
        } else {
            Err("claude 命令存在但返回错误，请检查安装".to_string())
        }
    }
}

#[async_trait]
impl AiProvider for ClaudeCliProvider {
    async fn stream(
        &self,
        system_prompt: &str,
        messages: &[ChatMessage],
        app: &AppHandle,
    ) -> Result<StreamResult, String> {
        let last_user = messages.iter().rev()
            .find(|m| m.role == "user")
            .map(|m| m.content.as_str())
            .unwrap_or("");

        // 合并 system prompt 和用户输入，通过 stdin 传入（避免命令行长度限制）
        let combined = format!("{}\n\n---\n\n用户输入：{}", system_prompt, last_user);

        let mut child = tokio::process::Command::new("claude")
            .arg("--print")
            .env_remove("CLAUDECODE")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("无法启动 claude 命令：{}。请确认已安装 Claude Code。", e))?;

        // 取出 stderr handle（在 wait 前取，避免 borrow 问题）
        let stderr_handle = child.stderr.take();

        // 写入 stdin
        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(combined.as_bytes()).await
                .map_err(|e| format!("写入 stdin 失败：{}", e))?;
            // drop stdin → 关闭管道 → claude 收到 EOF 开始处理
        }

        // 流式读取 stdout
        let mut stdout = child.stdout.take()
            .ok_or_else(|| "无法获取 stdout".to_string())?;

        let mut full_text = String::new();
        let mut buf = vec![0u8; 4096];

        loop {
            match stdout.read(&mut buf).await {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]);
                    full_text.push_str(&chunk);
                    let _ = app.emit("stream_chunk", chunk.as_ref());
                }
                Err(e) => return Err(format!("读取 stdout 失败：{}", e)),
            }
        }

        // 等待进程结束
        let status = child.wait().await
            .map_err(|e| format!("等待进程失败：{}", e))?;

        if !status.success() {
            let stderr_text = if let Some(mut stderr) = stderr_handle {
                let mut s = String::new();
                let _ = stderr.read_to_string(&mut s).await;
                s
            } else {
                String::new()
            };
            let msg = if stderr_text.trim().is_empty() {
                format!("claude 进程异常退出（exit code: {:?}）", status.code())
            } else {
                format!("claude 执行出错：{}", stderr_text.trim().chars().take(300).collect::<String>())
            };
            return Err(msg);
        }

        if full_text.trim().is_empty() {
            return Err("claude 返回了空响应，请检查登录状态（运行 `claude` 确认可用）".to_string());
        }

        Ok(StreamResult { full_text, input_tokens: None, output_tokens: None })
    }
}
