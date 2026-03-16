use async_trait::async_trait;
use tauri::AppHandle;
use crate::commands::stream::ChatMessage;

pub struct StreamResult {
    pub full_text: String,
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
}

#[async_trait]
pub trait AiProvider: Send + Sync {
    async fn stream(
        &self,
        system_prompt: &str,
        messages: &[ChatMessage],
        app: &AppHandle,
    ) -> Result<StreamResult, String>;
}

pub mod anthropic;
pub mod openai;
pub mod claude_cli;
