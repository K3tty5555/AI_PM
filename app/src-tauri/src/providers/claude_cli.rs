use std::sync::OnceLock;
use async_trait::async_trait;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use crate::providers::{AiProvider, StreamResult};
use crate::commands::stream::ChatMessage;

pub struct ClaudeCliProvider {
    pub work_dir: String,
}

/// PATH separator: `;` on Windows, `:` elsewhere
#[cfg(target_os = "windows")]
const PATH_SEP: char = ';';
#[cfg(not(target_os = "windows"))]
const PATH_SEP: char = ':';

/// Build a PATH that includes common user binary locations.
/// macOS .app and Windows installer both have minimal PATH.
pub fn enriched_path() -> String {
    let home = dirs::home_dir().unwrap_or_default();
    let mut paths: Vec<String> = Vec::new();

    // === Unix paths (macOS / Linux) ===
    #[cfg(not(target_os = "windows"))]
    {
        for p in &[
            ".local/bin",
            ".local/share/claude",
            ".local/claude-code/node_modules/.bin",
            ".npm-global/bin",
            ".cargo/bin",
        ] {
            paths.push(home.join(p).to_string_lossy().to_string());
        }

        // nvm: scan all installed node versions
        let nvm_versions = home.join(".nvm/versions/node");
        if let Ok(entries) = std::fs::read_dir(&nvm_versions) {
            for entry in entries.flatten() {
                let bin = entry.path().join("bin");
                if bin.exists() {
                    paths.push(bin.to_string_lossy().to_string());
                }
            }
        }
        // fnm
        let fnm_current = home.join(".local/share/fnm/aliases/default/bin");
        if fnm_current.exists() {
            paths.push(fnm_current.to_string_lossy().to_string());
        }
    }

    // === Windows paths ===
    #[cfg(target_os = "windows")]
    {
        // npm global: %APPDATA%\npm
        if let Ok(appdata) = std::env::var("APPDATA") {
            paths.push(format!("{}\\npm", appdata));
        }
        // Claude Code installer: %LOCALAPPDATA%\Programs\claude-code
        // and %LOCALAPPDATA%\claude
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            paths.push(format!("{}\\Programs\\claude-code", local));
            paths.push(format!("{}\\claude", local));
        }
        // User profile paths
        paths.push(home.join(".npm-global").to_string_lossy().to_string());
        paths.push(home.join(".cargo\\bin").to_string_lossy().to_string());

        // nvm-windows: %APPDATA%\nvm\<version>
        if let Ok(appdata) = std::env::var("APPDATA") {
            let nvm_dir = std::path::Path::new(&appdata).join("nvm");
            if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
                for entry in entries.flatten() {
                    if entry.path().is_dir() {
                        paths.push(entry.path().to_string_lossy().to_string());
                    }
                }
            }
        }
        // fnm on Windows
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            let fnm_current = std::path::Path::new(&local).join("fnm_multishells");
            if fnm_current.exists() {
                if let Ok(entries) = std::fs::read_dir(&fnm_current) {
                    // fnm creates temp dirs per shell; pick the latest
                    if let Some(latest) = entries.flatten().max_by_key(|e| e.metadata().and_then(|m| m.modified()).ok()) {
                        paths.push(latest.path().to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    let sys_path = std::env::var("PATH").unwrap_or_default();
    if sys_path.is_empty() {
        #[cfg(not(target_os = "windows"))]
        paths.push("/usr/local/bin:/usr/bin:/bin".to_string());
    } else {
        paths.push(sys_path);
    }
    paths.join(&PATH_SEP.to_string())
}

/// Candidate binary names for `claude` on the current platform.
#[cfg(target_os = "windows")]
const CLAUDE_BINARIES: &[&str] = &["claude.cmd", "claude.exe", "claude.ps1", "claude"];
#[cfg(not(target_os = "windows"))]
const CLAUDE_BINARIES: &[&str] = &["claude"];

/// Resolve the full path to `claude` binary by searching enriched PATH.
/// On Windows, tries claude.cmd, claude.exe, claude.ps1 in each directory.
pub fn resolve_claude_binary() -> String {
    let path = enriched_path();
    for dir in path.split(PATH_SEP) {
        for bin in CLAUDE_BINARIES {
            let candidate = std::path::Path::new(dir).join(bin);
            if candidate.exists() {
                return candidate.to_string_lossy().to_string();
            }
        }
    }
    "claude".to_string() // fallback: let OS try
}

/// Parse a semver-like version string, returning (major, minor, patch).
/// Accepts formats like "1.0.26", "claude-code 1.0.26", "1.0.26 (build xyz)" etc.
fn parse_version(version_str: &str) -> Option<(u32, u32, u32)> {
    // Find a pattern like N.N.N in the string
    for word in version_str.split_whitespace() {
        let parts: Vec<&str> = word.split('.').collect();
        if parts.len() >= 3 {
            if let (Ok(major), Ok(minor), Ok(patch)) = (
                parts[0].parse::<u32>(),
                parts[1].parse::<u32>(),
                // patch may have trailing non-numeric chars like "26-beta"
                parts[2].trim_end_matches(|c: char| !c.is_ascii_digit()).parse::<u32>(),
            ) {
                return Some((major, minor, patch));
            }
        }
    }
    None
}

static CLI_SUPPORTS_STREAM_JSON: OnceLock<bool> = OnceLock::new();

impl ClaudeCliProvider {
    /// 检测 `claude` 是否可用，返回 (版本行, 是否支持 stream-json) 或错误信息。
    /// stream-json 需要 >= 1.0.0。
    pub async fn check_available() -> Result<(String, bool), String> {
        let output = tokio::process::Command::new(resolve_claude_binary())
            .arg("--version")
            .env_remove("CLAUDECODE")
            .env("PATH", enriched_path())
            .output()
            .await
            .map_err(|_| "未找到 claude 命令，请先安装 Claude Code：https://claude.ai/code".to_string())?;

        if output.status.success() {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let display = if version.is_empty() { "claude (已安装)".to_string() } else { version.clone() };
            let supports_stream_json = parse_version(&version)
                .map(|(major, _, _)| major >= 1)
                .unwrap_or(false);
            Ok((display, supports_stream_json))
        } else {
            Err("claude 命令存在但返回错误，请检查安装".to_string())
        }
    }

    /// 按阶段返回工具白名单（用于 --allowedTools）
    fn tools_for_stream_key(stream_key: &str) -> &'static str {
        // stream_key format: "generate:{project_id}:{phase}"
        let phase = stream_key.rsplit(':').next().unwrap_or("");
        match phase {
            "research" => "WebSearch,WebFetch,Read",
            "prototype" => "Write,Read,Bash,WebSearch,WebFetch",
            "analytics" => "Read,Bash",
            p if p.starts_with("tool:") => "Read,WebSearch,WebFetch",
            _ => "Read",
        }
    }

    /// 原有的 --print 纯文本流式读取（作为 fallback）
    async fn stream_print(
        &self,
        system_prompt: &str,
        messages: &[ChatMessage],
        app: &AppHandle,
        stream_key: &str,
    ) -> Result<StreamResult, String> {
        let last_user = messages.iter().rev()
            .find(|m| m.role == "user")
            .map(|m| m.content.as_str())
            .unwrap_or("");

        let combined = format!("{}\n\n---\n\n用户输入：{}", system_prompt, last_user);

        let mut child = tokio::process::Command::new(resolve_claude_binary())
            .arg("--print")
            .arg("--dangerously-skip-permissions")
            .current_dir(&self.work_dir)
            .env_remove("CLAUDECODE")
            .env("PATH", enriched_path())
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("无法启动 claude 命令：{}。请确认已安装 Claude Code。", e))?;

        let stderr_handle = child.stderr.take();

        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(combined.as_bytes()).await
                .map_err(|e| format!("写入 stdin 失败：{}", e))?;
        }

        let mut stdout = child.stdout.take()
            .ok_or_else(|| "无法获取 stdout".to_string())?;

        let mut full_text = String::new();
        let mut buf = vec![0u8; 4096];

        let timeout = tokio::time::Duration::from_secs(900); // 15 minutes
        let result = tokio::time::timeout(timeout, async {
            loop {
                match stdout.read(&mut buf).await {
                    Ok(0) => break,
                    Ok(n) => {
                        let chunk = String::from_utf8_lossy(&buf[..n]);
                        full_text.push_str(&chunk);
                        let _ = app.emit("stream_chunk", serde_json::json!({ "streamKey": stream_key, "text": chunk.as_ref() }));
                    }
                    Err(e) => return Err(format!("读取 stdout 失败：{}", e)),
                }
            }
            Ok(())
        }).await;

        match result {
            Ok(Ok(())) => {}
            Ok(Err(e)) => return Err(e),
            Err(_) => {
                let _ = child.kill().await;
                return Err("claude 进程超时（15分钟），已终止".to_string());
            }
        }

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

        Ok(StreamResult { full_text, input_tokens: None, output_tokens: None, cost_usd: None })
    }

    /// stream-json 模式：解析 JSON 事件流，支持文本/思考/工具调用
    async fn stream_json(
        &self,
        system_prompt: &str,
        messages: &[ChatMessage],
        app: &AppHandle,
        stream_key: &str,
    ) -> Result<StreamResult, String> {
        let last_user = messages.iter().rev()
            .find(|m| m.role == "user")
            .map(|m| m.content.as_str())
            .unwrap_or("");

        let combined = format!("{}\n\n---\n\n用户输入：{}", system_prompt, last_user);

        let tools = Self::tools_for_stream_key(stream_key);

        let mut child = tokio::process::Command::new(resolve_claude_binary())
            .arg("-p")
            .arg("--output-format")
            .arg("stream-json")
            .arg("--verbose")
            .arg("--dangerously-skip-permissions")
            .arg("--allowedTools")
            .arg(tools)
            .current_dir(&self.work_dir)
            .env_remove("CLAUDECODE")
            .env("PATH", enriched_path())
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("无法启动 claude 命令：{}。请确认已安装 Claude Code。", e))?;

        let stderr_handle = child.stderr.take();

        // Write prompt via stdin
        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(combined.as_bytes()).await
                .map_err(|e| format!("写入 stdin 失败：{}", e))?;
            // drop closes pipe → EOF
        }

        let stdout = child.stdout.take()
            .ok_or_else(|| "无法获取 stdout".to_string())?;

        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        let mut full_text = String::new();
        let mut input_tokens: Option<u32> = None;
        let mut output_tokens: Option<u32> = None;
        let mut cost_usd: Option<f64> = None;

        const MAX_LINE_LEN: usize = 2 * 1024 * 1024; // 2MB
        let timeout = tokio::time::Duration::from_secs(900); // 15 minutes

        let parse_result = tokio::time::timeout(timeout, async {
            while let Some(line_result) = lines.next_line().await.transpose() {
                let line = match line_result {
                    Ok(l) => l,
                    Err(e) => {
                        // Non-UTF8 or IO error — skip
                        eprintln!("[stream-json] line read error: {}", e);
                        continue;
                    }
                };

                // Skip empty lines
                if line.trim().is_empty() {
                    continue;
                }

                // Skip super long lines
                if line.len() > MAX_LINE_LEN {
                    continue;
                }

                let event: serde_json::Value = match serde_json::from_str(&line) {
                    Ok(v) => v,
                    Err(_) => continue, // not valid JSON, skip
                };

                let event_type = event["type"].as_str().unwrap_or("");

                match event_type {
                    "assistant" => {
                        // Parse message.content[] array
                        if let Some(contents) = event["message"]["content"].as_array() {
                            for block in contents {
                                let block_type = block["type"].as_str().unwrap_or("");
                                match block_type {
                                    "text" => {
                                        if let Some(text) = block["text"].as_str() {
                                            full_text.push_str(text);
                                            let _ = app.emit("stream_chunk", serde_json::json!({
                                                "streamKey": stream_key,
                                                "text": text,
                                            }));
                                        }
                                    }
                                    "thinking" => {
                                        if let Some(thinking) = block["thinking"].as_str() {
                                            let _ = app.emit("stream_thinking", serde_json::json!({
                                                "streamKey": stream_key,
                                                "text": thinking,
                                            }));
                                        }
                                    }
                                    "tool_use" => {
                                        let tool_name = block["name"].as_str().unwrap_or("unknown");
                                        let _ = app.emit("stream_tool", serde_json::json!({
                                            "streamKey": stream_key,
                                            "tool": tool_name,
                                            "status": "running",
                                        }));
                                    }
                                    _ => {} // skip other block types
                                }
                            }
                        }
                    }
                    "result" => {
                        // Extract final result text
                        if let Some(result_text) = event["result"].as_str() {
                            // Only use result text if we haven't accumulated text from assistant events
                            if full_text.trim().is_empty() {
                                full_text = result_text.to_string();
                            }
                        }
                        // Extract cost
                        if let Some(c) = event["total_cost_usd"].as_f64() {
                            cost_usd = Some(c);
                        }
                        // Extract usage
                        if let Some(inp) = event["usage"]["input_tokens"].as_u64() {
                            input_tokens = Some(inp as u32);
                        }
                        if let Some(out) = event["usage"]["output_tokens"].as_u64() {
                            output_tokens = Some(out as u32);
                        }
                        // Clear tool status
                        let _ = app.emit("stream_tool", serde_json::json!({
                            "streamKey": stream_key,
                            "tool": "",
                            "status": "idle",
                        }));
                    }
                    // Skip system, rate_limit_event, etc.
                    _ => {}
                }
            }
            Ok::<(), String>(())
        }).await;

        match parse_result {
            Ok(Ok(())) => {}
            Ok(Err(e)) => return Err(e),
            Err(_) => {
                let _ = child.kill().await;
                return Err("claude 进程超时（15分钟），已终止".to_string());
            }
        }

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

        Ok(StreamResult { full_text, input_tokens, output_tokens, cost_usd })
    }
}

#[async_trait]
impl AiProvider for ClaudeCliProvider {
    async fn stream(
        &self,
        system_prompt: &str,
        messages: &[ChatMessage],
        app: &AppHandle,
        stream_key: &str,
    ) -> Result<StreamResult, String> {
        // Check version to decide stream mode (cached after first call)
        let supports_stream_json = if let Some(&cached) = CLI_SUPPORTS_STREAM_JSON.get() {
            cached
        } else {
            let result = match Self::check_available().await {
                Ok((_, supports)) => supports,
                Err(_) => false,
            };
            let _ = CLI_SUPPORTS_STREAM_JSON.set(result);
            result
        };

        if supports_stream_json {
            self.stream_json(system_prompt, messages, app, stream_key).await
        } else {
            self.stream_print(system_prompt, messages, app, stream_key).await
        }
    }
}
