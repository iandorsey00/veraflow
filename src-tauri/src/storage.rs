use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
#[derive(Serialize, Deserialize, Eq, PartialEq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum EmailHeader {
    Subject,
    To,
    Cc,
    Bcc,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EmailTemplate {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subject_enabled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub order: Option<Vec<EmailHeader>>,
    pub enabled: bool,
    pub subject: String,
    pub to: String,
    pub cc: String,
    pub bcc: String,
    pub cc_enabled: bool,
    pub bcc_enabled: bool,
}
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub placeholder_style: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<EmailTemplate>,
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
    #[serde(default = "enabled_by_default")]
    pub global_shortcuts: bool,
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
fn enabled_by_default() -> bool {
    true
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
            || actions
                .iter()
                .any(|a| p.shortcuts.get(*a).is_none_or(|s| s.len() > 100))
        {
            return Err("invalidLibrary".into());
        }
        let mut ids = std::collections::HashSet::new();
        for t in &self.templates {
            if t.placeholder_style
                .as_ref()
                .is_some_and(|style| !["angle", "braces"].contains(&style.as_str()))
                || t.id.is_empty()
                || !ids.insert(&t.id)
                || t.name.trim().is_empty()
                || t.name.len() > 1000
                || t.content.len() > 1024 * 1024
                || t.email.as_ref().is_some_and(|e| {
                    let invalid_order = e.order.as_ref().is_some_and(|order| {
                        order.len() != 4
                            || order.iter().collect::<std::collections::HashSet<_>>().len() != 4
                    });
                    let oversized = [&e.subject, &e.to, &e.cc, &e.bcc]
                        .iter()
                        .any(|v| v.len() > 1024 * 1024);
                    invalid_order || oversized
                })
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
            "preferences":{"language":"en","theme":"SYSTEM","launchAtLogin":false,"minimizeToTray":true,"alwaysOnTop":true,"globalShortcuts":true,"autoAdvance":true,"verifiedBackground":false,"verificationDefault":true,"clearAfterCompletion":true,"restoreClipboard":true,
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
        value["preferences"]
            .as_object_mut()
            .unwrap()
            .remove("globalShortcuts");
        let library: Library = serde_json::from_value(value).unwrap();
        assert!(!library.preferences.verified_background);
        assert!(library.preferences.global_shortcuts);
    }
    #[test]
    fn email_order_round_trips_and_rejects_invalid_orders() {
        let mut value = fixture();
        value["templates"][0]["email"] = serde_json::json!({"enabled":true,"subject":"","subjectEnabled":false,"order":["to","cc","bcc","subject"],"to":"to@example.test","cc":"","bcc":"","ccEnabled":false,"bccEnabled":false});
        let library: Library = serde_json::from_value(value.clone()).unwrap();
        assert!(library.validate().is_ok());
        assert_eq!(serde_json::to_value(library).unwrap(), value);
        value["templates"][0]["email"]["order"] = serde_json::json!(["to", "cc", "to", "subject"]);
        let invalid: Library = serde_json::from_value(value.clone()).unwrap();
        assert!(invalid.validate().is_err());
        value["templates"][0]["email"]["order"] = serde_json::json!(["body"]);
        assert!(serde_json::from_value::<Library>(value).is_err());
    }
    #[test]
    fn email_templates_round_trip_and_reject_session_data() {
        let mut value = fixture();
        value["templates"][0]["email"] = serde_json::json!({"enabled":true,"subject":"<subject>","to":"<to>","cc":"","bcc":"","ccEnabled":false,"bccEnabled":false});
        let library: Library = serde_json::from_value(value.clone()).unwrap();
        assert!(library.validate().is_ok());
        assert_eq!(serde_json::to_value(library).unwrap(), value);
        value["templates"][0]["email"]["deliveryIndex"] = serde_json::json!(1);
        assert!(serde_json::from_value::<Library>(value).is_err());
        let old: Library = serde_json::from_value(fixture()).unwrap();
        assert!(old.templates[0].email.is_none());
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
