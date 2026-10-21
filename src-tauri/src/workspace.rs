use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Folder {
    pub id: String,
    pub name: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExternalId {
    pub label: String,
    pub value: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Row {
    pub id: String,
    pub title: String,
    pub external_ids: Vec<ExternalId>,
    pub values: BTreeMap<String, String>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Table {
    pub id: String,
    pub name: String,
    pub folder_id: String,
    pub fields: Vec<String>,
    pub row_titles: bool,
    pub output: String,
    pub external_ids: Vec<ExternalId>,
    pub rows: Vec<Row>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Workspace {
    pub folders: Vec<Folder>,
    pub tables: Vec<Table>,
}
fn valid_id(id: &str) -> bool {
    id.len() == 39
        && id.starts_with("VF-")
        && id[3..].chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}
fn refs(values: &[ExternalId]) -> bool {
    values.len() <= 50
        && values
            .iter()
            .all(|r| !r.label.trim().is_empty() && r.label.len() <= 1000 && r.value.len() <= 4000)
}
impl Workspace {
    pub fn validate(&self) -> bool {
        let mut ids = HashSet::new();
        if self.folders.len() > 1000 || self.tables.len() > 1000 {
            return false;
        }
        for f in &self.folders {
            if !valid_id(&f.id)
                || !ids.insert(&f.id)
                || f.name.trim().is_empty()
                || f.name.len() > 4000
            {
                return false;
            }
        }
        for t in &self.tables {
            if !valid_id(&t.id)
                || !ids.insert(&t.id)
                || t.name.trim().is_empty()
                || t.name.len() > 4000
                || (!t.folder_id.is_empty() && !self.folders.iter().any(|f| f.id == t.folder_id))
                || t.fields.len() > 1000
                || t.fields.iter().collect::<HashSet<_>>().len() != t.fields.len()
                || t.fields.iter().any(|n| {
                    n.trim().is_empty() || n.len() > 1000 || n.chars().any(|c| c.is_control())
                })
                || t.output.len() > 1024 * 1024
                || !refs(&t.external_ids)
                || t.rows.len() > 10000
            {
                return false;
            }
            for r in &t.rows {
                if !valid_id(&r.id)
                    || !ids.insert(&r.id)
                    || r.title.len() > 4000
                    || !refs(&r.external_ids)
                    || r.values
                        .iter()
                        .any(|(n, v)| !t.fields.contains(n) || v.len() > 1024 * 1024)
                {
                    return false;
                }
            }
        }
        true
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> serde_json::Value {
        serde_json::json!({"folders":[],"tables":[{"id":"VF-11111111-1111-4111-8111-111111111111","name":"Trips","folderId":"","fields":["reference"],"rowTitles":false,"output":"{{reference}}","externalIds":[],"rows":[{"id":"VF-22222222-2222-4222-8222-222222222222","title":"","externalIds":[{"label":"Booking","value":"AB-104"}],"values":{"reference":"AB-104"}}]}]})
    }
    #[test]
    fn workspace_round_trips_saved_values() {
        let value = fixture();
        let w: Workspace = serde_json::from_value(value.clone()).unwrap();
        assert!(w.validate());
        assert_eq!(serde_json::to_value(w).unwrap(), value);
    }
    #[test]
    fn rejects_duplicate_ids_unknown_columns_and_session_metadata() {
        let mut value = fixture();
        value["tables"][0]["rows"][0]["id"] = value["tables"][0]["id"].clone();
        assert!(!serde_json::from_value::<Workspace>(value)
            .unwrap()
            .validate());
        let mut value = fixture();
        value["tables"][0]["rows"][0]["values"]["extra"] = serde_json::json!("no");
        assert!(!serde_json::from_value::<Workspace>(value)
            .unwrap()
            .validate());
        let mut value = fixture();
        value["tables"][0]["rows"][0]["verified"] = serde_json::json!(true);
        assert!(serde_json::from_value::<Workspace>(value).is_err());
    }
}
