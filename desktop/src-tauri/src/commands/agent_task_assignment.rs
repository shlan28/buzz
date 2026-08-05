use nostr::{EventBuilder, Keys, Kind};
use tauri::AppHandle;

use crate::{
    app_state::AppState,
    managed_agents::{
        load_personas, managed_agent_avatar_url, ManagedAgentRecord, TaskAssignmentPolicy,
    },
    relay::{relay_ws_url_with_override, sync_managed_agent_profile},
};

pub(super) fn apply_task_assignment_patch(
    record: &mut ManagedAgentRecord,
    policy: Option<TaskAssignmentPolicy>,
    allowlist: Option<&[String]>,
) -> Result<bool, String> {
    let next_policy = policy.unwrap_or(record.task_assignment_policy);
    let next_allowlist = match allowlist {
        Some(values) => crate::managed_agents::validate_respond_to_allowlist(values)?,
        None => record.task_assignment_allowlist.clone(),
    };
    if next_policy == TaskAssignmentPolicy::Allowlist && next_allowlist.is_empty() {
        return Err(
            "task assignment policy 'allowlist' requires at least one pubkey in the allowlist"
                .to_string(),
        );
    }
    let changed = next_policy != record.task_assignment_policy
        || (allowlist.is_some() && next_allowlist != record.task_assignment_allowlist);
    record.task_assignment_policy = next_policy;
    if allowlist.is_some() {
        record.task_assignment_allowlist = next_allowlist;
    }
    Ok(changed)
}

pub(super) struct AgentProfileSync {
    keys: Keys,
    relay_url: String,
    display_name: String,
    avatar_url: Option<String>,
    auth_tag: Option<String>,
    sync_name: bool,
    sync_task_policy: bool,
    task_policy: TaskAssignmentPolicy,
    task_allowlist: Vec<String>,
}

impl AgentProfileSync {
    pub(super) fn from_record(
        app: &AppHandle,
        state: &AppState,
        record: &ManagedAgentRecord,
        sync_name: bool,
        sync_task_policy: bool,
    ) -> Result<Self, String> {
        let keys = Keys::parse(&record.private_key_nsec)
            .map_err(|error| format!("failed to parse agent keys: {error}"))?;
        let relay_url = crate::relay::effective_agent_relay_url(
            &record.relay_url,
            &relay_ws_url_with_override(state),
        );
        let personas = load_personas(app).unwrap_or_default();
        let command = crate::managed_agents::record_agent_command(record, &personas);
        let avatar_url = record
            .avatar_url
            .clone()
            .or_else(|| managed_agent_avatar_url(&command));
        Ok(Self {
            keys,
            relay_url,
            display_name: record.name.clone(),
            avatar_url,
            auth_tag: record.auth_tag.clone(),
            sync_name,
            sync_task_policy,
            task_policy: record.task_assignment_policy,
            task_allowlist: record.task_assignment_allowlist.clone(),
        })
    }

    pub(super) async fn run(self, state: &AppState) -> Result<(), String> {
        if self.sync_name {
            sync_managed_agent_profile(
                state,
                &self.relay_url,
                &self.keys,
                &self.display_name,
                self.avatar_url.as_deref(),
                self.auth_tag.as_deref(),
            )
            .await?;
        }
        if self.sync_task_policy {
            sync_task_assignment_profile(
                state,
                &self.keys,
                self.auth_tag.as_deref(),
                self.task_policy,
                &self.task_allowlist,
            )
            .await?;
        }
        Ok(())
    }
}

async fn sync_task_assignment_profile(
    state: &AppState,
    keys: &Keys,
    auth_tag: Option<&str>,
    policy: TaskAssignmentPolicy,
    allowlist: &[String],
) -> Result<(), String> {
    let existing = crate::relay::query_relay(
        state,
        &[serde_json::json!({
            "authors": [keys.public_key().to_hex()], "kinds": [10100], "limit": 1
        })],
    )
    .await?;
    let mut content = existing
        .first()
        .and_then(|event| serde_json::from_str::<serde_json::Value>(&event.content).ok())
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    content
        .entry("channel_add_policy".to_string())
        .or_insert_with(|| serde_json::json!("owner_only"));
    content.insert(
        "task_assignment_policy".to_string(),
        serde_json::json!(policy.as_str()),
    );
    content.insert(
        "task_assignment_allowlist".to_string(),
        serde_json::json!(allowlist),
    );
    let event = EventBuilder::new(
        Kind::Custom(10100),
        serde_json::Value::Object(content).to_string(),
    );
    crate::relay::submit_event_with_keys(event, state, keys, auth_tag)
        .await
        .map(|_| ())
}
