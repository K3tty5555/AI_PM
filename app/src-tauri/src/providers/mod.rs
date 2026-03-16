use async_trait::async_trait;
use tauri::AppHandle;
use crate::commands::stream::ChatMessage;

#[async_trait]
pub trait AiProvider: Send + Sync {
    async fn stream(
        &self,
        system_prompt: &str,
        messages: &[ChatMessage],
        app: &AppHandle,
    ) -> Result<String, String>;
}

pub mod anthropic;
pub mod openai;
pub mod claude_cli;
