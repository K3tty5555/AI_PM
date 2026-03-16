use async_trait::async_trait;
use tauri::{AppHandle, Emitter};
use crate::providers::AiProvider;
use crate::commands::stream::ChatMessage;

pub struct OpenAIProvider {
    pub api_key: String,
    pub base_url: String,
    pub model: String,
}

#[async_trait]
impl AiProvider for OpenAIProvider {
    async fn stream(
        &self,
        system_prompt: &str,
        messages: &[ChatMessage],
        app: &AppHandle,
    ) -> Result<String, String> {
        let url = format!("{}/v1/chat/completions", self.base_url.trim_end_matches('/'));
        let mut messages_json: Vec<serde_json::Value> = vec![
            serde_json::json!({"role": "system", "content": system_prompt})
        ];
        for m in messages {
            messages_json.push(serde_json::json!({"role": m.role, "content": m.content}));
        }
        let body = serde_json::json!({
            "model": self.model,
            "max_tokens": 8192,
            "stream": true,
            "messages": messages_json,
        });

        let client = reqwest::Client::new();
        let mut resp = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", &self.api_key))
            .header("content-type", "application/json")
            .header("User-Agent", "claude-code/1.0.0")
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
                                if let Some(choices) = event["choices"].as_array() {
                                    if let Some(choice) = choices.first() {
                                        if let Some(text) = choice["delta"]["content"].as_str() {
                                            if !text.is_empty() {
                                                full_text.push_str(text);
                                                let _ = app.emit("stream_chunk", text);
                                            }
                                        }
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

        Ok(full_text)
    }
}
