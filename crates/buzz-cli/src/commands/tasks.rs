//! `buzz tasks` — community task commands and current-state queries.

use chrono::DateTime;
use nostr::{Event, EventBuilder, PublicKey};
use serde::Serialize;
use std::str::FromStr;

use crate::client::BuzzClient;
use crate::error::CliError;
use crate::TasksCmd;
use buzz_sdk::{
    build_task_create, build_task_delete, build_task_mutate, TaskCreateInput, TaskDeleteInput,
    TaskMutateInput, TaskPriority, TaskStatus,
};

const KIND_TASK_STATE: u16 = buzz_core::kind::KIND_TASK_STATE as u16;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
struct TaskSnapshot {
    id: String,
    state_event_id: String,
    title: String,
    description: String,
    creator: String,
    last_editor: String,
    assignee: Option<String>,
    assignee_type: Option<String>,
    status: String,
    priority: String,
    due: Option<u64>,
    labels: Vec<String>,
    project: Option<String>,
    channel: Option<String>,
    source_event: String,
    created_at: u64,
    updated_at: u64,
    archived: bool,
}

impl TaskSnapshot {
    fn from_event(event: &Event) -> Result<Self, CliError> {
        if event.kind.as_u16() != KIND_TASK_STATE {
            return Err(CliError::Other(format!(
                "unexpected task state kind {}",
                event.kind.as_u16()
            )));
        }

        let mut id = None;
        let mut title = None;
        let mut creator = None;
        let mut last_editor = None;
        let mut assignee = None;
        let mut assignee_type = None;
        let mut status = None;
        let mut priority = None;
        let mut due = None;
        let mut labels = Vec::new();
        let mut project = None;
        let mut channel = None;
        let mut source_event = None;
        let mut created_at = None;
        let mut archived = false;

        for tag in event.tags.iter() {
            let parts = tag.as_slice();
            let Some(name) = parts.first().map(String::as_str) else {
                continue;
            };
            let value = parts.get(1).map(String::as_str).unwrap_or_default();
            match name {
                "d" => id = Some(value.to_string()),
                "title" => title = Some(value.to_string()),
                "creator" => creator = Some(value.to_string()),
                "last_editor" => last_editor = Some(value.to_string()),
                "p" => {
                    assignee = Some(value.to_string());
                    assignee_type = parts.get(3).cloned().filter(|value| !value.is_empty());
                }
                "t" if value.starts_with("task-status:") => {
                    status = value.strip_prefix("task-status:").map(str::to_string);
                }
                "t" if value.starts_with("task-priority:") => {
                    priority = value.strip_prefix("task-priority:").map(str::to_string);
                }
                "t" if value.starts_with("label:") => {
                    if let Some(label) = value.strip_prefix("label:") {
                        labels.push(label.to_string());
                    }
                }
                "due" => due = value.parse().ok(),
                "a" => project = Some(value.to_string()),
                "h" => channel = Some(value.to_string()),
                "source_event" => source_event = Some(value.to_string()),
                "created_at" => created_at = value.parse().ok(),
                "archived" => archived = value == "true" || value == "1",
                _ => {}
            }
        }

        Ok(Self {
            id: id.ok_or_else(|| CliError::Other("task state is missing d tag".into()))?,
            state_event_id: event.id.to_hex(),
            title: title
                .ok_or_else(|| CliError::Other("task state is missing title tag".into()))?,
            description: event.content.clone(),
            creator: creator
                .ok_or_else(|| CliError::Other("task state is missing creator tag".into()))?,
            last_editor: last_editor
                .ok_or_else(|| CliError::Other("task state is missing last_editor tag".into()))?,
            assignee,
            assignee_type,
            status: status.unwrap_or_else(|| "todo".into()),
            priority: priority.unwrap_or_else(|| "none".into()),
            due,
            labels,
            project,
            channel,
            source_event: source_event
                .ok_or_else(|| CliError::Other("task state is missing source_event tag".into()))?,
            created_at: created_at.unwrap_or_else(|| event.created_at.as_secs()),
            updated_at: event.created_at.as_secs(),
            archived,
        })
    }
}

fn parse_task_id(value: &str) -> Result<uuid::Uuid, CliError> {
    uuid::Uuid::parse_str(value)
        .map_err(|error| CliError::Usage(format!("--id must be a UUID: {error}")))
}

fn validate_event_id(value: &str, field: &str) -> Result<(), CliError> {
    if value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err(CliError::Usage(format!(
            "{field} must be a 64-character hex event id"
        )))
    }
}

fn normalize_assignee(value: &str, me: &str) -> Result<Option<String>, CliError> {
    match value {
        "me" => Ok(Some(me.to_string())),
        "none" => Ok(None),
        value => PublicKey::from_hex(value)
            .map(|key| Some(key.to_hex()))
            .map_err(|error| {
                CliError::Usage(format!(
                    "--assignee must be `me`, `none`, or a 64-hex pubkey: {error}"
                ))
            }),
    }
}

fn parse_due(value: &str) -> Result<i64, CliError> {
    if let Ok(seconds) = value.parse::<i64>() {
        if seconds < 0 {
            return Err(CliError::Usage(
                "--due must not be before Unix epoch".into(),
            ));
        }
        return Ok(seconds);
    }
    let seconds = DateTime::parse_from_rfc3339(value)
        .map_err(|error| CliError::Usage(format!("invalid --due timestamp: {error}")))?
        .timestamp();
    if seconds < 0 {
        Err(CliError::Usage(
            "--due must not be before Unix epoch".into(),
        ))
    } else {
        Ok(seconds)
    }
}

async fn publish_command(
    client: &BuzzClient,
    task_id: &str,
    builder: EventBuilder,
) -> Result<(), CliError> {
    let event = client.sign_event(builder)?;
    let event_id = event.id.to_hex();
    let raw = match client.submit_event(event).await {
        Err(CliError::Relay { body, .. }) if body.contains("conflict:") => {
            return Err(CliError::Conflict(body));
        }
        result => result?,
    };
    let response: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|error| CliError::Other(format!("relay response is not JSON: {error}")))?;
    if !response
        .get("accepted")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
    {
        return Err(CliError::Other(format!(
            "relay rejected task command: {}",
            response
                .get("message")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
        )));
    }
    let command_result = response
        .get("message")
        .and_then(serde_json::Value::as_str)
        .and_then(|message| message.strip_prefix("response:"))
        .and_then(|json| serde_json::from_str::<serde_json::Value>(json).ok());
    let mut state_event_id = command_result
        .as_ref()
        .and_then(|value| value.get("state_event_id"))
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .to_string();
    if state_event_id.is_empty() {
        state_event_id = fetch_task(client, task_id)
            .await?
            .map(|task| task.state_event_id)
            .unwrap_or_default();
    }
    println!(
        "{}",
        serde_json::json!({
            "event_id": event_id,
            "accepted": true,
            "message": if command_result.is_some() { "stored" } else { "duplicate: already processed" },
            "task_id": task_id,
            "state_event_id": state_event_id,
        })
    );
    Ok(())
}

async fn publish_delete(
    client: &BuzzClient,
    task_id: &str,
    builder: EventBuilder,
) -> Result<(), CliError> {
    let event = client.sign_event(builder)?;
    let event_id = event.id.to_hex();
    let raw = match client.submit_event(event).await {
        Err(CliError::Relay { body, .. }) if body.contains("conflict:") => {
            return Err(CliError::Conflict(body));
        }
        result => result?,
    };
    let response: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|error| CliError::Other(format!("relay response is not JSON: {error}")))?;
    if !response
        .get("accepted")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
    {
        return Err(CliError::Other(format!(
            "relay rejected task delete: {}",
            response
                .get("message")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
        )));
    }
    println!("{}", delete_output(&event_id, task_id));
    Ok(())
}

fn delete_output(event_id: &str, task_id: &str) -> serde_json::Value {
    serde_json::json!({
        "event_id": event_id,
        "accepted": true,
        "message": "deleted",
        "task_id": task_id,
    })
}

async fn fetch_task(client: &BuzzClient, id: &str) -> Result<Option<TaskSnapshot>, CliError> {
    let relay = relay_self(client).await?;
    let filter = serde_json::json!({
        "kinds": [KIND_TASK_STATE],
        "authors": [relay],
        "#d": [id],
        "limit": 2,
    });
    let mut snapshots = client
        .query(&filter)
        .await
        .and_then(|raw| {
            serde_json::from_str::<Vec<Event>>(&raw).map_err(|error| {
                CliError::Other(format!("failed to parse relay response: {error}"))
            })
        })?
        .iter()
        .map(TaskSnapshot::from_event)
        .collect::<Result<Vec<_>, _>>()?;
    snapshots.sort_by_key(|snapshot| std::cmp::Reverse(snapshot.updated_at));
    Ok(snapshots.into_iter().next())
}

async fn relay_self(client: &BuzzClient) -> Result<String, CliError> {
    let raw = client
        .get_public("/")
        .await
        .map_err(|error| CliError::Other(format!("failed to fetch relay info: {error}")))?;
    let value: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|error| CliError::Other(format!("relay info is not valid JSON: {error}")))?;
    let relay = value
        .get("self")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| CliError::Other("relay info is missing `self` pubkey".into()))?;
    PublicKey::from_hex(relay)
        .map(|key| key.to_hex())
        .map_err(|error| CliError::Other(format!("relay info has invalid `self` pubkey: {error}")))
}

pub async fn dispatch(command: TasksCmd, client: &BuzzClient) -> Result<(), CliError> {
    match command {
        TasksCmd::Create {
            title,
            id,
            description,
            assignee,
            status,
            priority,
            due,
            labels,
            project,
            channel,
            source_event,
        } => {
            let id = id
                .as_deref()
                .map(parse_task_id)
                .transpose()?
                .unwrap_or_else(uuid::Uuid::new_v4);
            let assignee = normalize_assignee(&assignee, &client.keys().public_key().to_hex())?;
            let due = due.as_deref().map(parse_due).transpose()?;
            let channel = channel
                .as_deref()
                .map(uuid::Uuid::parse_str)
                .transpose()
                .map_err(|error| CliError::Usage(format!("--channel must be a UUID: {error}")))?;
            let input = TaskCreateInput {
                id,
                title,
                description: description.unwrap_or_default(),
                assignee,
                status: TaskStatus::from_str(&status)
                    .map_err(|error| CliError::Usage(error.to_string()))?,
                priority: TaskPriority::from_str(&priority)
                    .map_err(|error| CliError::Usage(error.to_string()))?,
                due,
                labels,
                project,
                channel,
                source_event,
            };
            let builder =
                build_task_create(&input).map_err(|error| CliError::Usage(error.to_string()))?;
            publish_command(client, &id.to_string(), builder).await
        }
        TasksCmd::Get { id } => {
            let id = parse_task_id(&id)?.to_string();
            let task = fetch_task(client, &id)
                .await?
                .ok_or_else(|| CliError::NotFound(format!("task not found: {id}")))?;
            println!(
                "{}",
                serde_json::to_string_pretty(&task)
                    .map_err(|error| CliError::Other(error.to_string()))?
            );
            Ok(())
        }
        TasksCmd::List {
            assignee,
            statuses,
            priorities,
            labels,
            project,
            channel,
            include_archived,
            limit,
            cursor,
        } => {
            let relay = relay_self(client).await?;
            let mut filter = serde_json::json!({
                "kinds": [KIND_TASK_STATE],
                "authors": [relay],
            });
            let normalized_assignee = assignee
                .as_deref()
                .map(|value| normalize_assignee(value, &client.keys().public_key().to_hex()))
                .transpose()?;
            if let Some(Some(pubkey)) = normalized_assignee.as_ref() {
                filter["#p"] = serde_json::json!([pubkey]);
            }
            if statuses.len() == 1 {
                let first = &statuses[0];
                filter["#t"] = serde_json::json!([format!("task-status:{first}")]);
            }
            if let Some(cursor) = cursor {
                let (until, before_id) = cursor.split_once(':').ok_or_else(|| {
                    CliError::Usage("--cursor must be <unix-seconds>:<event-id>".into())
                })?;
                let until = until.parse::<u64>().map_err(|_| {
                    CliError::Usage("--cursor must be <unix-seconds>:<event-id>".into())
                })?;
                validate_event_id(before_id, "--cursor event id")?;
                filter["until"] = serde_json::json!(until);
                filter["before_id"] = serde_json::json!(before_id);
            }
            let values = client.query_all(filter).await?;
            let mut tasks = values
                .into_iter()
                .map(|value| {
                    serde_json::from_value::<Event>(value).map_err(|error| {
                        CliError::Other(format!("failed to parse relay event: {error}"))
                    })
                })
                .collect::<Result<Vec<_>, _>>()?
                .iter()
                .map(TaskSnapshot::from_event)
                .collect::<Result<Vec<_>, _>>()?;
            tasks.retain(|task| {
                let assignee_matches = match normalized_assignee.as_ref() {
                    Some(None) => task.assignee.is_none(),
                    _ => true,
                };
                assignee_matches
                    && (statuses.is_empty() || statuses.contains(&task.status))
                    && (priorities.is_empty() || priorities.contains(&task.priority))
                    && labels.iter().all(|label| task.labels.contains(label))
                    && project
                        .as_ref()
                        .is_none_or(|value| task.project.as_ref() == Some(value))
                    && channel
                        .as_ref()
                        .is_none_or(|value| task.channel.as_ref() == Some(value))
                    && (include_archived || !task.archived)
            });
            tasks.sort_by_key(|task| std::cmp::Reverse(task.updated_at));
            tasks.truncate(limit as usize);
            println!(
                "{}",
                serde_json::to_string_pretty(&tasks)
                    .map_err(|error| CliError::Other(error.to_string()))?
            );
            Ok(())
        }
        TasksCmd::Update {
            id,
            expected_event,
            title,
            description,
            clear_description,
            status,
            priority,
            due,
            clear_due,
            labels,
            clear_labels,
            project,
            clear_project,
            channel,
            clear_channel,
        } => {
            let id = parse_task_id(&id)?;
            validate_event_id(&expected_event, "--expected-event")?;
            let channel = channel
                .as_deref()
                .map(uuid::Uuid::parse_str)
                .transpose()
                .map_err(|error| CliError::Usage(format!("--channel must be a UUID: {error}")))?;
            let input = TaskMutateInput {
                id,
                previous_event: expected_event,
                title,
                description: if clear_description {
                    Some(None)
                } else {
                    description.map(Some)
                },
                status: status
                    .as_deref()
                    .map(TaskStatus::from_str)
                    .transpose()
                    .map_err(|error| CliError::Usage(error.to_string()))?,
                priority: priority
                    .as_deref()
                    .map(TaskPriority::from_str)
                    .transpose()
                    .map_err(|error| CliError::Usage(error.to_string()))?,
                due: if clear_due {
                    Some(None)
                } else {
                    due.as_deref().map(parse_due).transpose()?.map(Some)
                },
                labels: if clear_labels {
                    Some(Vec::new())
                } else if labels.is_empty() {
                    None
                } else {
                    Some(labels)
                },
                project: if clear_project {
                    Some(None)
                } else {
                    project.map(Some)
                },
                channel: if clear_channel {
                    Some(None)
                } else {
                    channel.map(Some)
                },
                ..TaskMutateInput::default()
            };
            let builder =
                build_task_mutate(&input).map_err(|error| CliError::Usage(error.to_string()))?;
            publish_command(client, &id.to_string(), builder).await
        }
        TasksCmd::Assign {
            id,
            assignee,
            expected_event,
        } => {
            let id = parse_task_id(&id)?;
            validate_event_id(&expected_event, "--expected-event")?;
            let input = TaskMutateInput {
                id,
                previous_event: expected_event,
                assignee: Some(normalize_assignee(
                    &assignee,
                    &client.keys().public_key().to_hex(),
                )?),
                ..TaskMutateInput::default()
            };
            let builder =
                build_task_mutate(&input).map_err(|error| CliError::Usage(error.to_string()))?;
            publish_command(client, &id.to_string(), builder).await
        }
        TasksCmd::Archive { id, expected_event } => {
            let id = parse_task_id(&id)?;
            validate_event_id(&expected_event, "--expected-event")?;
            let input = TaskMutateInput {
                id,
                previous_event: expected_event,
                archived: Some(true),
                ..TaskMutateInput::default()
            };
            let builder =
                build_task_mutate(&input).map_err(|error| CliError::Usage(error.to_string()))?;
            publish_command(client, &id.to_string(), builder).await
        }
        TasksCmd::Delete { id, expected_event } => {
            let id = parse_task_id(&id)?;
            validate_event_id(&expected_event, "--expected-event")?;
            let input = TaskDeleteInput {
                id,
                previous_event: expected_event,
            };
            let builder =
                build_task_delete(&input).map_err(|error| CliError::Usage(error.to_string()))?;
            publish_delete(client, &id.to_string(), builder).await
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assignee_accepts_me_none_and_hex() {
        let me = nostr::Keys::generate().public_key().to_hex();
        let other = nostr::Keys::generate().public_key().to_hex();
        assert_eq!(normalize_assignee("me", &me).unwrap(), Some(me));
        assert_eq!(normalize_assignee("none", "unused").unwrap(), None);
        assert_eq!(normalize_assignee(&other, "unused").unwrap(), Some(other));
        assert!(normalize_assignee("Alice", "unused").is_err());
    }

    #[test]
    fn due_accepts_unix_and_rfc3339() {
        assert_eq!(parse_due("1785547800").unwrap(), 1_785_547_800);
        assert_eq!(
            parse_due("2026-08-01T09:30:00+08:00").unwrap(),
            1_785_547_800
        );
        assert!(parse_due("not-a-date").is_err());
    }

    #[test]
    fn task_and_event_ids_are_strict() {
        assert!(parse_task_id("10eef02c-9be8-4055-a747-e348d5a405ad").is_ok());
        assert!(parse_task_id("task-1").is_err());
        assert!(validate_event_id(&"a".repeat(64), "event").is_ok());
        assert!(validate_event_id(&"z".repeat(64), "event").is_err());
    }

    #[test]
    fn delete_output_is_stable() {
        assert_eq!(
            delete_output(&"a".repeat(64), "10eef02c-9be8-4055-a747-e348d5a405ad"),
            serde_json::json!({
                "event_id": "a".repeat(64),
                "accepted": true,
                "message": "deleted",
                "task_id": "10eef02c-9be8-4055-a747-e348d5a405ad",
            })
        );
    }
}
