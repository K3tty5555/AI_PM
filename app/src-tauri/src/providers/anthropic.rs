use async_trait::async_trait;
use tauri::{AppHandle, Emitter};
use crate::providers::{AiProvider, StreamResult};
use crate::commands::stream::ChatMessage;

pub struct AnthropicProvider {
    pub api_key: String,
    pub base_url: String,
    pub model: String,
}

#[async_trait]
impl AiProvider for AnthropicProvider {
    async fn stream(
        &self,
        system_prompt: &str,
        messages: &[ChatMessage],
        app: &AppHandle,
        stream_key: &str,
    ) -> Result<StreamResult, String> {
        let url = format!("{}/v1/messages", self.base_url.trim_end_matches('/'));
        let messages_json: Vec<serde_json::Value> = messages.iter().map(|m| {
            serde_json::json!({"role": m.role, "content": m.content})
        }).collect();
        let body = serde_json::json!({
            "model": self.model,
            "max_tokens": 8192,
            "stream": true,
            "system": system_prompt,
            "messages": messages_json,
        });

        let client = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(30))
            .timeout(std::time::Duration::from_secs(600))
            .build()
            .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))?;
        let mut resp = client
            .post(&url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("HTTP error: {}", e))?;

        if !resp.status().is_success() {
            let err_body = resp.text().await.unwrap_or_default();
            return Err(format!("API error: {}", err_body));
        }

        let mut full_text = String::new();
        let mut buffer = String::new();
        let mut input_tokens: Option<u32> = None;
        let mut output_tokens: Option<u32> = None;

        while let Some(chunk) = resp.chunk().await.map_err(|e| format!("Stream read error: {}", e))? {
            buffer.push_str(&String::from_utf8_lossy(&chunk));
            loop {
                if let Some(pos) = buffer.find("\n\n") {
                    let event_str = buffer[..pos].to_string();
                    buffer = buffer[pos + 2..].to_string();
                    for line in event_str.lines() {
                        if let Some(data) = line.strip_prefix("data: ") {
                            if data == "[DONE]" { continue; }
                            if let Ok(event) = serde_json::from_str::<serde_json::Value>(data) {
                                if event["type"] == "message_start" {
                                    if let Some(n) = event["message"]["usage"]["input_tokens"].as_u64() {
                                        input_tokens = Some(n as u32);
                                    }
                                }
                                if event["type"] == "message_delta" {
                                    if let Some(n) = event["usage"]["output_tokens"].as_u64() {
                                        output_tokens = Some(n as u32);
                                    }
                                }
                                if event["type"] == "content_block_delta" {
                                    if let Some(text) = event["delta"]["text"].as_str() {
                                        full_text.push_str(text);
                                        let _ = app.emit("stream_chunk", serde_json::json!({ "streamKey": stream_key, "text": text }));
                                    }
                                }
                            }
                        }
                    }
                } else {
                    break;
                }
            }
        }

        if full_text.is_empty() {
            let error_msg = if let Ok(json) = serde_json::from_str::<serde_json::Value>(&buffer) {
                json["error"]["message"]
                    .as_str()
                    .unwrap_or("API 返回了空响应，请检查 API 配置")
                    .to_string()
            } else if !buffer.trim().is_empty() {
                format!("API 返回了空响应：{}", buffer.trim().chars().take(200).collect::<String>())
            } else {
                "API 返回了空响应，请检查 API 配置".to_string()
            };
            return Err(error_msg);
        }

        Ok(StreamResult { full_text, input_tokens, output_tokens, cost_usd: None })
    }
}
