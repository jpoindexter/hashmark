use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "settings.json";
const KEYS_KEY: &str = "api_keys";

/// All provider IDs we support. Order = display order in Settings UI.
pub const PROVIDERS: &[(&str, &str)] = &[
    ("anthropic", "Anthropic"),
    ("openai", "OpenAI"),
    ("gemini", "Google Gemini"),
    ("mistral", "Mistral"),
    ("groq", "Groq"),
    ("deepseek", "DeepSeek"),
    ("openrouter", "OpenRouter"),
    ("ollama", "Ollama (local)"),
    ("grok", "xAI Grok"),
];

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProviderInfo {
    pub id: String,
    pub label: String,
    pub has_key: bool,
}

pub fn get_api_key(app: &AppHandle, provider: &str) -> Option<String> {
    let store = app.store(STORE_FILE).ok()?;
    let keys = store.get(KEYS_KEY)?;
    keys.get(provider)?.as_str().map(|s| s.to_string())
}

pub fn set_api_key(app: &AppHandle, provider: &str, key: &str) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let mut keys = store
        .get(KEYS_KEY)
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default();
    if key.is_empty() {
        keys.remove(provider);
    } else {
        keys.insert(provider.to_string(), serde_json::Value::String(key.to_string()));
    }
    store.set(KEYS_KEY, serde_json::Value::Object(keys));
    store.save().map_err(|e| e.to_string())
}

pub fn list_providers(app: &AppHandle) -> Vec<ProviderInfo> {
    let keys = app
        .store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(KEYS_KEY))
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default();

    PROVIDERS
        .iter()
        .map(|(id, label)| ProviderInfo {
            id: id.to_string(),
            label: label.to_string(),
            has_key: keys.get(*id).and_then(|v| v.as_str()).is_some_and(|s| !s.is_empty()),
        })
        .collect()
}
