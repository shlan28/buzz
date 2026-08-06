//! `buzz tracks` — work Track commands and current-state queries.

use nostr::{Event, EventBuilder, PublicKey};
use serde::Serialize;
use std::str::FromStr;

use crate::client::BuzzClient;
use crate::error::CliError;
use crate::TracksCmd;
use buzz_sdk::{
    build_track_create, build_track_mutate, TrackCreateInput, TrackMutateInput, TrackStatus,
};

const KIND_TRACK_STATE: u16 = buzz_core::kind::KIND_TRACK_STATE as u16;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
struct TrackSnapshot {
    id: String,
    state_event_id: String,
    name: String,
    description: String,
    owner: String,
    owner_type: Option<String>,
    members: Vec<String>,
    start_date: String,
    end_date: String,
    status: String,
    archived: bool,
    creator: String,
    last_editor: String,
    source_event: String,
    created_at: u64,
    updated_at: u64,
}

impl TrackSnapshot {
    fn from_event(event: &Event) -> Result<Self, CliError> {
        if event.kind.as_u16() != KIND_TRACK_STATE {
            return Err(CliError::Other(format!(
                "unexpected track state kind {}",
                event.kind.as_u16()
            )));
        }

        let mut id = None;
        let mut name = None;
        let mut owner = None;
        let mut owner_type = None;
        let mut members = Vec::new();
        let mut start_date = None;
        let mut end_date = None;
        let mut status = None;
        let mut archived = false;
        let mut creator = None;
        let mut last_editor = None;
        let mut source_event = None;
        let mut created_at = None;

        for tag in event.tags.iter() {
            let parts = tag.as_slice();
            let Some(tag_name) = parts.first().map(String::as_str) else {
                continue;
            };
            let value = parts.get(1).map(String::as_str).unwrap_or_default();
            match tag_name {
                "d" => id = Some(value.to_string()),
                "title" => name = Some(value.to_string()),
                "p" => {
                    owner = Some(value.to_string());
                    owner_type = parts.get(3).cloned().filter(|value| !value.is_empty());
                }
                "member" => members.push(value.to_string()),
                "start_date" => start_date = Some(value.to_string()),
                "end_date" => end_date = Some(value.to_string()),
                "t" if value.starts_with("track-status:") => {
                    status = value.strip_prefix("track-status:").map(str::to_string);
                }
                "archived" => archived = value == "true" || value == "1",
                "creator" => creator = Some(value.to_string()),
                "last_editor" => last_editor = Some(value.to_string()),
                "source_event" => source_event = Some(value.to_string()),
                "created_at" => created_at = value.parse().ok(),
                _ => {}
            }
        }

        Ok(Self {
            id: required(id, "d")?,
            state_event_id: event.id.to_hex(),
            name: required(name, "title")?,
            description: event.content.clone(),
            owner: required(owner, "p")?,
            owner_type,
            members,
            start_date: required(start_date, "start_date")?,
            end_date: required(end_date, "end_date")?,
            status: status.unwrap_or_else(|| "planned".into()),
            archived,
            creator: required(creator, "creator")?,
            last_editor: required(last_editor, "last_editor")?,
            source_event: required(source_event, "source_event")?,
            created_at: created_at.unwrap_or_else(|| event.created_at.as_secs()),
            updated_at: event.created_at.as_secs(),
        })
    }
}

fn required(value: Option<String>, tag: &str) -> Result<String, CliError> {
    value.ok_or_else(|| CliError::Other(format!("track state is missing {tag} tag")))
}

fn parse_track_id(value: &str) -> Result<uuid::Uuid, CliError> {
    uuid::Uuid::parse_str(value)
        .map_err(|error| CliError::Usage(format!("--id must be a UUID: {error}")))
}

fn validate_event_id(value: &str) -> Result<(), CliError> {
    if value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err(CliError::Usage(
            "--expected-event must be a 64-character hex event id".into(),
        ))
    }
}

fn normalize_owner(value: &str, me: &str) -> Result<String, CliError> {
    if value == "me" {
        return Ok(me.to_string());
    }
    PublicKey::from_hex(value)
        .map(|key| key.to_hex())
        .map_err(|error| {
            CliError::Usage(format!("--owner must be `me` or a 64-hex pubkey: {error}"))
        })
}

fn normalize_members(values: Vec<String>) -> Result<Vec<String>, CliError> {
    let mut normalized = Vec::with_capacity(values.len());
    for value in values {
        let member = PublicKey::from_hex(&value)
            .map(|key| key.to_hex())
            .map_err(|error| {
                CliError::Usage(format!("--member must be a 64-hex pubkey: {error}"))
            })?;
        if !normalized.contains(&member) {
            normalized.push(member);
        }
    }
    Ok(normalized)
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

async fn fetch_track(client: &BuzzClient, id: &str) -> Result<Option<TrackSnapshot>, CliError> {
    let filter = serde_json::json!({
        "kinds": [KIND_TRACK_STATE],
        "authors": [relay_self(client).await?],
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
        .map(TrackSnapshot::from_event)
        .collect::<Result<Vec<_>, _>>()?;
    snapshots.sort_by_key(|snapshot| std::cmp::Reverse(snapshot.updated_at));
    Ok(snapshots.into_iter().next())
}

async fn publish_command(
    client: &BuzzClient,
    track_id: &str,
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
            "relay rejected track command: {}",
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
        state_event_id = fetch_track(client, track_id)
            .await?
            .map(|track| track.state_event_id)
            .unwrap_or_default();
    }
    println!(
        "{}",
        serde_json::json!({
            "event_id": event_id,
            "accepted": true,
            "message": if command_result.is_some() { "stored" } else { "duplicate: already processed" },
            "track_id": track_id,
            "state_event_id": state_event_id,
        })
    );
    Ok(())
}

pub async fn dispatch(command: TracksCmd, client: &BuzzClient) -> Result<(), CliError> {
    match command {
        TracksCmd::Create {
            name,
            id,
            description,
            owner,
            members,
            start_date,
            end_date,
            status,
        } => {
            let id = id
                .as_deref()
                .map(parse_track_id)
                .transpose()?
                .unwrap_or_else(uuid::Uuid::new_v4);
            let input = TrackCreateInput {
                id,
                name,
                description: description.unwrap_or_default(),
                owner: normalize_owner(&owner, &client.keys().public_key().to_hex())?,
                members: normalize_members(members)?,
                start_date,
                end_date,
                status: TrackStatus::from_str(&status)
                    .map_err(|error| CliError::Usage(error.to_string()))?,
            };
            let builder =
                build_track_create(&input).map_err(|error| CliError::Usage(error.to_string()))?;
            publish_command(client, &id.to_string(), builder).await
        }
        TracksCmd::Get { id } => {
            let id = parse_track_id(&id)?.to_string();
            let track = fetch_track(client, &id)
                .await?
                .ok_or_else(|| CliError::NotFound(format!("track not found: {id}")))?;
            println!(
                "{}",
                serde_json::to_string_pretty(&track)
                    .map_err(|error| CliError::Other(error.to_string()))?
            );
            Ok(())
        }
        TracksCmd::List {
            scope,
            status,
            owner,
            limit,
        } => {
            let mut filter = serde_json::json!({
                "kinds": [KIND_TRACK_STATE],
                "authors": [relay_self(client).await?],
            });
            let owner = owner
                .as_deref()
                .map(|value| normalize_owner(value, &client.keys().public_key().to_hex()))
                .transpose()?;
            if let Some(owner) = owner.as_ref() {
                filter["#p"] = serde_json::json!([owner]);
            }
            if let Some(status) = status.as_ref() {
                filter["#t"] = serde_json::json!([format!("track-status:{status}")]);
            }
            let values = client.query_all(filter).await?;
            let mut tracks = values
                .into_iter()
                .map(|value| {
                    serde_json::from_value::<Event>(value).map_err(|error| {
                        CliError::Other(format!("failed to parse relay event: {error}"))
                    })
                })
                .collect::<Result<Vec<_>, _>>()?
                .iter()
                .map(TrackSnapshot::from_event)
                .collect::<Result<Vec<_>, _>>()?;
            tracks.retain(|track| {
                let scope_matches = match scope.as_str() {
                    "current" => {
                        !track.archived && matches!(track.status.as_str(), "planned" | "active")
                    }
                    "completed" => {
                        !track.archived && matches!(track.status.as_str(), "completed" | "canceled")
                    }
                    "archived" => track.archived,
                    _ => false,
                };
                scope_matches
                    && status.as_ref().is_none_or(|value| &track.status == value)
                    && owner.as_ref().is_none_or(|value| &track.owner == value)
            });
            match scope.as_str() {
                "current" => tracks.sort_by(|left, right| {
                    let rank = |status: &str| if status == "active" { 0 } else { 1 };
                    rank(&left.status)
                        .cmp(&rank(&right.status))
                        .then_with(|| left.end_date.cmp(&right.end_date))
                        .then_with(|| left.name.cmp(&right.name))
                }),
                _ => tracks.sort_by_key(|track| std::cmp::Reverse(track.updated_at)),
            }
            tracks.truncate(limit as usize);
            println!(
                "{}",
                serde_json::to_string_pretty(&tracks)
                    .map_err(|error| CliError::Other(error.to_string()))?
            );
            Ok(())
        }
        TracksCmd::Update {
            id,
            expected_event,
            name,
            description,
            clear_description,
            owner,
            members,
            clear_members,
            start_date,
            end_date,
            status,
        } => {
            let id = parse_track_id(&id)?;
            validate_event_id(&expected_event)?;
            let input = TrackMutateInput {
                id,
                previous_event: expected_event,
                name,
                description: if clear_description {
                    Some(None)
                } else {
                    description.map(Some)
                },
                owner: owner
                    .as_deref()
                    .map(|value| normalize_owner(value, &client.keys().public_key().to_hex()))
                    .transpose()?,
                members: if clear_members {
                    Some(Vec::new())
                } else if members.is_empty() {
                    None
                } else {
                    Some(normalize_members(members)?)
                },
                start_date,
                end_date,
                status: status
                    .as_deref()
                    .map(TrackStatus::from_str)
                    .transpose()
                    .map_err(|error| CliError::Usage(error.to_string()))?,
                archived: None,
            };
            let builder =
                build_track_mutate(&input).map_err(|error| CliError::Usage(error.to_string()))?;
            publish_command(client, &id.to_string(), builder).await
        }
        TracksCmd::Archive { id, expected_event } => {
            mutate_archived(client, id, expected_event, true).await
        }
        TracksCmd::Restore { id, expected_event } => {
            mutate_archived(client, id, expected_event, false).await
        }
    }
}

async fn mutate_archived(
    client: &BuzzClient,
    id: String,
    expected_event: String,
    archived: bool,
) -> Result<(), CliError> {
    let id = parse_track_id(&id)?;
    validate_event_id(&expected_event)?;
    let input = TrackMutateInput {
        id,
        previous_event: expected_event,
        archived: Some(archived),
        ..TrackMutateInput::default()
    };
    let builder = build_track_mutate(&input).map_err(|error| CliError::Usage(error.to_string()))?;
    publish_command(client, &id.to_string(), builder).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use nostr::{Kind, Tag};

    #[test]
    fn owner_accepts_me_and_hex() {
        let me = nostr::Keys::generate().public_key().to_hex();
        let other = nostr::Keys::generate().public_key().to_hex();
        assert_eq!(normalize_owner("me", &me).unwrap(), me);
        assert_eq!(normalize_owner(&other, "unused").unwrap(), other);
        assert!(normalize_owner("Alice", "unused").is_err());
    }

    #[test]
    fn members_are_validated_and_deduplicated() {
        let first = nostr::Keys::generate().public_key().to_hex();
        let second = nostr::Keys::generate().public_key().to_hex();
        assert_eq!(
            normalize_members(vec![first.clone(), second.clone(), first.clone()]).unwrap(),
            vec![first, second]
        );
        assert!(normalize_members(vec!["Alice".into()]).is_err());
    }

    #[test]
    fn ids_are_strict() {
        assert!(parse_track_id("10eef02c-9be8-4055-a747-e348d5a405ad").is_ok());
        assert!(parse_track_id("track-1").is_err());
        assert!(validate_event_id(&"a".repeat(64)).is_ok());
        assert!(validate_event_id(&"z".repeat(64)).is_err());
    }

    #[test]
    fn snapshot_parses_track_state_contract() {
        let track_id = uuid::Uuid::new_v4();
        let creator = nostr::Keys::generate().public_key().to_hex();
        let owner = nostr::Keys::generate().public_key().to_hex();
        let event = EventBuilder::new(
            Kind::Custom(KIND_TRACK_STATE),
            "Keep desktop delivery reliable",
        )
        .tags([
            Tag::parse(["d", &track_id.to_string()]).unwrap(),
            Tag::parse(["title", "Desktop foundations"]).unwrap(),
            Tag::parse(["p", &owner]).unwrap(),
            Tag::parse(["member", &creator]).unwrap(),
            Tag::parse(["start_date", "2026-08-01"]).unwrap(),
            Tag::parse(["end_date", "2026-08-30"]).unwrap(),
            Tag::parse(["t", "track-status:active"]).unwrap(),
            Tag::parse(["archived", "false"]).unwrap(),
            Tag::parse(["creator", &creator]).unwrap(),
            Tag::parse(["last_editor", &creator]).unwrap(),
            Tag::parse(["source_event", &"a".repeat(64)]).unwrap(),
            Tag::parse(["created_at", "1785542400"]).unwrap(),
        ])
        .sign_with_keys(&nostr::Keys::generate())
        .unwrap();

        let snapshot = TrackSnapshot::from_event(&event).unwrap();
        assert_eq!(snapshot.id, track_id.to_string());
        assert_eq!(snapshot.name, "Desktop foundations");
        assert_eq!(snapshot.owner, owner);
        assert_eq!(snapshot.members, vec![creator]);
        assert_eq!(snapshot.status, "active");
        assert!(!snapshot.archived);
    }
}
