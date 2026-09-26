use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Comparison {
    pub mode: String,
    pub case_sensitive: bool,
    pub unicode: bool,
    pub punctuation: bool,
    pub collapse_lines: bool,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Template {
    pub id: String,
    pub name: String,
    pub folder: String,
    pub content: String,
    pub field_order: Vec<String>,
    pub verification_enabled: bool,
    pub comparison: Comparison,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    pub language: String,
    pub theme: String,
    pub launch_at_login: bool,
    pub minimize_to_tray: bool,
    pub always_on_top: bool,
    pub auto_advance: bool,
    #[serde(default)]
    pub verified_background: bool,
    pub verification_default: bool,
    pub clear_after_completion: bool,
    pub restore_clipboard: bool,
    pub comparison: Comparison,
    pub shortcuts: BTreeMap<String, String>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Library {
    pub version: u32,
    pub templates: Vec<Template>,
    pub preferences: Preferences,
}
impl Library {
    pub fn validate(&self) -> Result<(), String> {
        let valid_comparison = |c: &Comparison| ["exact", "whitespace"].contains(&c.mode.as_str());
        let actions = [
            "capture", "previous", "next", "clear", "skip", "verify", "cancel", "finish",
        ];
        let p = &self.preferences;
        if self.version != 1
            || self.templates.len() > 1000
            || !["en", "zh-CN"].contains(&p.language.as_str())
            || !["SYSTEM", "LIGHT", "DARK"].contains(&p.theme.as_str())
            || !valid_comparison(&p.comparison)
            || p.shortcuts.len() != 8
            || actions.iter().any(|a| {
                p.shortcuts
                    .get(*a)
                    .is_none_or(|s| s.is_empty() || s.len() > 100)
            })
        {
            return Err("invalidLibrary".into());
        }
        let mut ids = std::collections::HashSet::new();
        for t in &self.templates {
            if t.id.is_empty()
                || !ids.insert(&t.id)
                || t.name.trim().is_empty()
                || t.name.len() > 1000
                || t.content.len() > 1024 * 1024
                || !valid_comparison(&t.comparison)
            {
                return Err("invalidLibrary".into());
            }
        }
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> serde_json::Value {
        serde_json::json!({
            "version":1,"templates":[{"id":"test","name":"Example","folder":"","content":"Hello <name>","fieldOrder":["name"],"verificationEnabled":true,
                "comparison":{"mode":"exact","caseSensitive":true,"unicode":true,"punctuation":false,"collapseLines":false}}],
            "preferences":{"language":"en","theme":"SYSTEM","launchAtLogin":false,"minimizeToTray":true,"alwaysOnTop":true,"autoAdvance":true,"verifiedBackground":false,"verificationDefault":true,"clearAfterCompletion":true,"restoreClipboard":true,
                "comparison":{"mode":"whitespace","caseSensitive":true,"unicode":true,"punctuation":false,"collapseLines":true},
                "shortcuts":{"capture":"Control+1","previous":"Control+2","next":"Control+3","clear":"Control+4","skip":"Control+5","verify":"Control+6","cancel":"Control+7","finish":"Control+8"}}
        })
    }
    #[test]
    fn old_preferences_default_to_neutral_background() {
        let mut value = fixture();
        value["preferences"]
            .as_object_mut()
            .unwrap()
            .remove("verifiedBackground");
        let library: Library = serde_json::from_value(value).unwrap();
        assert!(!library.preferences.verified_background);
    }
    #[test]
    fn valid_library_round_trips() {
        let library: Library = serde_json::from_value(fixture()).unwrap();
        assert!(library.validate().is_ok());
        assert_eq!(serde_json::to_value(library).unwrap(), fixture());
    }
    #[test]
    fn rejects_session_data_at_each_persistence_boundary() {
        let mut value = fixture();
        value["session"] = serde_json::json!({"value":"synthetic"});
        assert!(serde_json::from_value::<Library>(value).is_err());
        let mut value = fixture();
        value["templates"][0]["fields"] = serde_json::json!({"name":"synthetic"});
        assert!(serde_json::from_value::<Library>(value).is_err());
        let mut value = fixture();
        value["preferences"]["clipboard"] = serde_json::json!("synthetic");
        assert!(serde_json::from_value::<Library>(value).is_err());
    }
    #[test]
    fn rejects_unknown_versions_invalid_rules_and_duplicate_ids() {
        let mut library: Library = serde_json::from_value(fixture()).unwrap();
        library.version = 2;
        assert!(library.validate().is_err());
        library.version = 1;
        library.preferences.comparison.mode = "fuzzy".into();
        assert!(library.validate().is_err());
        let mut value = fixture();
        let duplicate = value["templates"][0].clone();
        value["templates"].as_array_mut().unwrap().push(duplicate);
        assert!(serde_json::from_value::<Library>(value)
            .unwrap()
            .validate()
            .is_err());
    }
}
