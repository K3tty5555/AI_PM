use tokio::io::AsyncWriteExt;
use crate::commands::config::{is_anthropic, read_config_internal, Backend};
use crate::providers::claude_cli::{resolve_claude_binary, enriched_path};

/// Call AI via Anthropic or OpenAI-compatible API (non-streaming).
pub async fn call_ai_via_api(
    api_key: &str,
    base_url: &str,
    model: &str,
    prompt: &str,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))?;

    if is_anthropic(base_url, model) {
        let url = format!("{}/v1/messages", base_url.trim_end_matches('/'));
        let body = serde_json::json!({
            "model": model,
            "max_tokens": 2048,
            "stream": false,
            "messages": [{"role": "user", "content": prompt}],
        });

        let resp = client
            .post(&url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("HTTP 请求失败：{}", e))?;

        if !resp.status().is_success() {
            let err_body = resp.text().await.unwrap_or_default();
            return Err(format!("Anthropic API 错误：{}", err_body));
        }

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("解析响应失败：{}", e))?;

        json["content"][0]["text"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "Anthropic 响应中未找到 content[0].text".to_string())
    } else {
        let url = format!("{}/v1/chat/completions", base_url.trim_end_matches('/'));
        let body = serde_json::json!({
            "model": model,
            "max_tokens": 2048,
            "stream": false,
            "messages": [{"role": "user", "content": prompt}],
        });

        let resp = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("HTTP 请求失败：{}", e))?;

        if !resp.status().is_success() {
            let err_body = resp.text().await.unwrap_or_default();
            return Err(format!("OpenAI API 错误：{}", err_body));
        }

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("解析响应失败：{}", e))?;

        json["choices"][0]["message"]["content"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "OpenAI 响应中未找到 choices[0].message.content".to_string())
    }
}

/// Call AI via Claude CLI (non-streaming, wait for full output).
pub async fn call_ai_via_cli(prompt: &str) -> Result<String, String> {
    let binary = resolve_claude_binary();
    let path_env = enriched_path();

    let mut child = tokio::process::Command::new(&binary)
        .arg("--print")
        .arg("--allowedTools")
        .arg("Read")
        .env_remove("CLAUDECODE")
        .env("PATH", &path_env)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("无法启动 claude 命令：{}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(prompt.as_bytes())
            .await
            .map_err(|e| format!("写入 stdin 失败：{}", e))?;
        // drop stdin to close pipe
    }

    let output = child
        .wait_with_output()
        .await
        .map_err(|e| format!("等待 claude 进程失败：{}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "claude 进程异常退出（exit code: {:?}）：{}",
            output.status.code(),
            stderr.chars().take(300).collect::<String>()
        ));
    }

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        return Err("claude 返回了空响应".to_string());
    }

    Ok(text)
}

/// Unified non-streaming AI call — picks API or CLI based on config.
pub async fn call_ai_non_streaming(config_dir: &str, prompt: &str) -> Result<String, String> {
    let config = read_config_internal(config_dir)
        .ok_or_else(|| "未找到 AI 配置，请先在设置中配置 API Key 或 Claude CLI".to_string())?;

    match config.backend {
        Backend::ClaudeCli => call_ai_via_cli(prompt).await,
        Backend::Api => {
            let api_key = config
                .api_key
                .filter(|k| !k.is_empty())
                .ok_or_else(|| "API Key 未配置".to_string())?;
            let base_url = config
                .base_url
                .filter(|u| !u.is_empty())
                .unwrap_or_else(|| "https://api.anthropic.com".to_string());
            call_ai_via_api(&api_key, &base_url, &config.model, prompt).await
        }
    }
}
