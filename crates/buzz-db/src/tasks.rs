//! Atomic persistence for Buzz Tasks command and derived state events.

use buzz_core::CommunityId;
use nostr::Event;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::error::{DbError, Result};

/// Result of atomically applying a task command.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApplyTaskResult {
    /// Command and new state were inserted.
    Applied,
    /// This exact command was already processed.
    Duplicate,
}

/// Result of atomically soft-deleting a task.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeleteTaskResult {
    /// Current state and actor-authored history were hidden and the marker stored.
    Deleted,
}

/// Atomically store an execution command and replace its relay-derived state.
/// The task advisory lock serializes requests and Agent claims across relay pods.
pub async fn apply_task_execution_events(
    pool: &PgPool,
    community_id: CommunityId,
    task_id: Uuid,
    execution_id: Uuid,
    command: &Event,
    state: &Event,
    channel_id: Option<Uuid>,
    is_new_request: bool,
) -> Result<ApplyTaskResult> {
    let mut tx = pool.begin().await?;
    let lock_key = i64::from_le_bytes(
        task_id.as_bytes()[..8]
            .try_into()
            .map_err(|_| DbError::InvalidData("task UUID could not produce lock key".into()))?,
    );
    sqlx::query("SELECT pg_advisory_xact_lock($1)")
        .bind(lock_key)
        .execute(tx.as_mut())
        .await?;

    let duplicate = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM events WHERE community_id = $1 AND id = $2)",
    )
    .bind(community_id.as_uuid())
    .bind(command.id.as_bytes().as_slice())
    .fetch_one(tx.as_mut())
    .await?;
    if duplicate {
        return Ok(ApplyTaskResult::Duplicate);
    }

    let active = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM events WHERE community_id = $1 AND kind = $2 \
         AND deleted_at IS NULL AND tags @> $3 AND (tags @> $4 OR tags @> $5))",
    )
    .bind(community_id.as_uuid())
    .bind(buzz_core::kind::KIND_TASK_EXECUTION_STATE as i32)
    .bind(serde_json::json!([["t", format!("task-id:{task_id}")]]))
    .bind(serde_json::json!([["status", "queued"]]))
    .bind(serde_json::json!([["status", "running"]]))
    .fetch_one(tx.as_mut())
    .await?;
    if is_new_request && active {
        return Err(DbError::Conflict(
            "task already has an active execution".into(),
        ));
    }

    let current = sqlx::query(
        "SELECT id, tags FROM events WHERE community_id = $1 AND kind = $2 AND d_tag = $3 \
         AND deleted_at IS NULL FOR UPDATE",
    )
    .bind(community_id.as_uuid())
    .bind(buzz_core::kind::KIND_TASK_EXECUTION_STATE as i32)
    .bind(execution_id.to_string())
    .fetch_optional(tx.as_mut())
    .await?;
    if is_new_request && current.is_some() {
        return Err(DbError::Conflict("execution id already exists".into()));
    }
    if !is_new_request && current.is_none() {
        return Err(DbError::NotFound("execution not found".into()));
    }
    if !is_new_request {
        let current_tags: serde_json::Value = current
            .as_ref()
            .ok_or_else(|| DbError::NotFound("execution not found".into()))?
            .try_get("tags")?;
        let belongs_to_task = current_tags.as_array().is_some_and(|tags| {
            tags.iter().any(|tag| {
                let Some(parts) = tag.as_array() else {
                    return false;
                };
                parts.first().and_then(serde_json::Value::as_str) == Some("t")
                    && parts.get(1).and_then(serde_json::Value::as_str)
                        == Some(format!("task-id:{task_id}").as_str())
            })
        });
        if !belongs_to_task {
            return Err(DbError::Conflict(
                "execution belongs to another task".into(),
            ));
        }
        let previous_status = current_tags
            .as_array()
            .and_then(|tags| {
                tags.iter().find_map(|tag| {
                    let parts = tag.as_array()?;
                    (parts.first()?.as_str()? == "status")
                        .then(|| parts.get(1)?.as_str())
                        .flatten()
                })
            })
            .unwrap_or_default();
        let next_status = command
            .tags
            .iter()
            .find_map(|tag| {
                let parts = tag.as_slice();
                (parts.first().map(String::as_str) == Some("status"))
                    .then(|| parts.get(1).map(String::as_str))
                    .flatten()
            })
            .unwrap_or_default();
        let allowed = matches!(
            (previous_status, next_status),
            ("queued", "running")
                | ("queued", "cancelled")
                | ("running", "finished")
                | ("running", "failed")
                | ("running", "cancelled")
        );
        if !allowed {
            return Err(DbError::Conflict(format!(
                "invalid execution transition {previous_status} -> {next_status}"
            )));
        }
    }

    insert_raw(&mut tx, community_id, command, channel_id, None).await?;
    if current.is_some() {
        sqlx::query(
            "UPDATE events SET deleted_at = NOW() WHERE community_id = $1 AND kind = $2 \
             AND d_tag = $3 AND deleted_at IS NULL",
        )
        .bind(community_id.as_uuid())
        .bind(buzz_core::kind::KIND_TASK_EXECUTION_STATE as i32)
        .bind(execution_id.to_string())
        .execute(tx.as_mut())
        .await?;
    }
    insert_raw(
        &mut tx,
        community_id,
        state,
        channel_id,
        Some(execution_id.to_string()),
    )
    .await?;
    tx.commit().await?;
    Ok(ApplyTaskResult::Applied)
}

/// Store an actor command and replace its relay-signed state under one lock.
pub async fn apply_task_events(
    pool: &PgPool,
    community_id: CommunityId,
    task_id: Uuid,
    expected_state_id: Option<&[u8]>,
    command: &Event,
    state: &Event,
    channel_id: Option<Uuid>,
) -> Result<ApplyTaskResult> {
    let mut tx = pool.begin().await?;
    let lock_key = i64::from_le_bytes(
        task_id.as_bytes()[..8]
            .try_into()
            .map_err(|_| DbError::InvalidData("task UUID could not produce lock key".into()))?,
    );
    sqlx::query("SELECT pg_advisory_xact_lock($1)")
        .bind(lock_key)
        .execute(tx.as_mut())
        .await?;

    // A deletion marker is a permanent ID fence even when that marker was
    // itself hidden later. Check it before command-event dedup so replaying
    // the exact original create is rejected rather than reported as success.
    if expected_state_id.is_none() {
        let deleted_marker_exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM events WHERE community_id = $1 AND kind = $2 \
             AND tags @> $3)",
        )
        .bind(community_id.as_uuid())
        .bind(buzz_core::kind::KIND_TASK_DELETE as i32)
        .bind(serde_json::json!([["t", format!("task-id:{task_id}")]]))
        .fetch_one(tx.as_mut())
        .await?;
        if deleted_marker_exists {
            return Err(DbError::Conflict("task id was soft-deleted".into()));
        }
    }

    let duplicate = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM events WHERE community_id = $1 AND id = $2)",
    )
    .bind(community_id.as_uuid())
    .bind(command.id.as_bytes().as_slice())
    .fetch_one(tx.as_mut())
    .await?;
    if duplicate {
        return Ok(ApplyTaskResult::Duplicate);
    }

    let current = sqlx::query(
        "SELECT id FROM events WHERE community_id = $1 AND kind = $2 AND d_tag = $3 \
         AND deleted_at IS NULL FOR UPDATE",
    )
    .bind(community_id.as_uuid())
    .bind(buzz_core::kind::KIND_TASK_STATE as i32)
    .bind(task_id.to_string())
    .fetch_optional(tx.as_mut())
    .await?;
    let current_id = current.map(|row| row.get::<Vec<u8>, _>("id"));
    match (expected_state_id, current_id.as_deref()) {
        (None, None) => {}
        (None, Some(_)) => return Err(DbError::Conflict("task already exists".into())),
        (Some(_), None) => return Err(DbError::Conflict("task state no longer exists".into())),
        (Some(expected), Some(current)) if expected == current => {}
        (Some(_), Some(_)) => return Err(DbError::Conflict("task state changed".into())),
    }

    insert_raw(&mut tx, community_id, command, channel_id, None).await?;
    if current_id.is_some() {
        sqlx::query(
            "UPDATE events SET deleted_at = NOW() WHERE community_id = $1 AND kind = $2 \
             AND d_tag = $3 AND deleted_at IS NULL",
        )
        .bind(community_id.as_uuid())
        .bind(buzz_core::kind::KIND_TASK_STATE as i32)
        .bind(task_id.to_string())
        .execute(tx.as_mut())
        .await?;
    }
    insert_raw(
        &mut tx,
        community_id,
        state,
        channel_id,
        Some(task_id.to_string()),
    )
    .await?;
    tx.commit().await?;
    Ok(ApplyTaskResult::Applied)
}

/// Soft-delete a task's current state and complete command history, retaining
/// only the signed minimal deletion marker.
pub async fn delete_task_events(
    pool: &PgPool,
    community_id: CommunityId,
    task_id: Uuid,
    expected_state_id: &[u8],
    delete_marker: &Event,
    channel_id: Option<Uuid>,
) -> Result<DeleteTaskResult> {
    let mut tx = pool.begin().await?;
    let lock_key = i64::from_le_bytes(
        task_id.as_bytes()[..8]
            .try_into()
            .map_err(|_| DbError::InvalidData("task UUID could not produce lock key".into()))?,
    );
    sqlx::query("SELECT pg_advisory_xact_lock($1)")
        .bind(lock_key)
        .execute(tx.as_mut())
        .await?;

    let current_id = sqlx::query_scalar::<_, Vec<u8>>(
        "SELECT id FROM events WHERE community_id = $1 AND kind = $2 AND d_tag = $3 \
         AND deleted_at IS NULL FOR UPDATE",
    )
    .bind(community_id.as_uuid())
    .bind(buzz_core::kind::KIND_TASK_STATE as i32)
    .bind(task_id.to_string())
    .fetch_optional(tx.as_mut())
    .await?
    .ok_or_else(|| DbError::NotFound("task not found".into()))?;
    if current_id.as_slice() != expected_state_id {
        return Err(DbError::Conflict("task state changed".into()));
    }

    let task_tag = serde_json::json!([["t", format!("task-id:{task_id}")]]);
    sqlx::query(
        "UPDATE events SET deleted_at = NOW() WHERE community_id = $1 AND deleted_at IS NULL \
         AND ((kind = $2 AND d_tag = $3) OR (kind IN ($4, $5) AND tags @> $6))",
    )
    .bind(community_id.as_uuid())
    .bind(buzz_core::kind::KIND_TASK_STATE as i32)
    .bind(task_id.to_string())
    .bind(buzz_core::kind::KIND_TASK_CREATE as i32)
    .bind(buzz_core::kind::KIND_TASK_MUTATE as i32)
    .bind(task_tag)
    .execute(tx.as_mut())
    .await?;
    insert_raw(&mut tx, community_id, delete_marker, channel_id, None).await?;
    tx.commit().await?;
    Ok(DeleteTaskResult::Deleted)
}

async fn insert_raw(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    community_id: CommunityId,
    event: &Event,
    channel_id: Option<Uuid>,
    d_tag: Option<String>,
) -> Result<()> {
    let created_at = chrono::DateTime::from_timestamp(event.created_at.as_secs() as i64, 0)
        .ok_or(DbError::InvalidTimestamp(event.created_at.as_secs() as i64))?;
    sqlx::query(
        "INSERT INTO events (community_id,id,pubkey,created_at,kind,tags,content,sig,received_at,channel_id,d_tag) \
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9,$10)",
    )
    .bind(community_id.as_uuid())
    .bind(event.id.as_bytes().as_slice())
    .bind(event.pubkey.to_bytes().as_slice())
    .bind(created_at)
    .bind(event.kind.as_u16() as i32)
    .bind(serde_json::to_value(&event.tags)?)
    .bind(&event.content)
    .bind(event.sig.serialize().as_slice())
    .bind(channel_id)
    .bind(d_tag)
    .execute(tx.as_mut())
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use nostr::{EventBuilder, Keys, Kind, Tag};

    async fn setup() -> (PgPool, CommunityId) {
        let url = std::env::var("BUZZ_TEST_DATABASE_URL")
            .or_else(|_| std::env::var("DATABASE_URL"))
            .unwrap_or_else(|_| "postgres://buzz:buzz_dev@localhost:5432/buzz".into());
        let pool = PgPool::connect(&url)
            .await
            .expect("connect to test database");
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO communities (id, host) VALUES ($1, $2)")
            .bind(id)
            .bind(format!("task-atomic-{}.example", id.simple()))
            .execute(&pool)
            .await
            .expect("insert test community");
        (pool, CommunityId::from_uuid(id))
    }

    #[tokio::test]
    #[ignore = "requires PostgreSQL with current migrations"]
    async fn state_insert_failure_rolls_back_command() {
        let (pool, community) = setup().await;
        let keys = Keys::generate();
        let task_id = Uuid::new_v4();
        let command = EventBuilder::new(Kind::Custom(buzz_core::kind::KIND_TASK_CREATE as u16), "")
            .tags([Tag::parse(["t", &format!("task-id:{task_id}")]).unwrap()])
            .sign_with_keys(&keys)
            .unwrap();
        // Reusing the command as state forces the second INSERT to violate the
        // event primary key after the command INSERT has run.
        assert!(
            apply_task_events(&pool, community, task_id, None, &command, &command, None)
                .await
                .is_err()
        );
        let persisted: i64 =
            sqlx::query_scalar("SELECT count(*) FROM events WHERE community_id = $1 AND id = $2")
                .bind(community.as_uuid())
                .bind(command.id.as_bytes().as_slice())
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(persisted, 0, "failed state insert must roll back command");
    }

    #[tokio::test]
    #[ignore = "requires PostgreSQL with current migrations"]
    async fn stale_expected_state_does_not_store_mutation() {
        let (pool, community) = setup().await;
        let actor = Keys::generate();
        let relay = Keys::generate();
        let task_id = Uuid::new_v4();
        let id_tag = Tag::parse(["t", &format!("task-id:{task_id}")]).unwrap();
        let command = EventBuilder::new(Kind::Custom(buzz_core::kind::KIND_TASK_CREATE as u16), "")
            .tags([id_tag.clone()])
            .sign_with_keys(&actor)
            .unwrap();
        let state = EventBuilder::new(Kind::Custom(buzz_core::kind::KIND_TASK_STATE as u16), "")
            .tags([Tag::parse(["d", &task_id.to_string()]).unwrap()])
            .sign_with_keys(&relay)
            .unwrap();
        assert_eq!(
            apply_task_events(&pool, community, task_id, None, &command, &state, None)
                .await
                .unwrap(),
            ApplyTaskResult::Applied
        );

        let mutation =
            EventBuilder::new(Kind::Custom(buzz_core::kind::KIND_TASK_MUTATE as u16), "")
                .tags([id_tag])
                .sign_with_keys(&actor)
                .unwrap();
        let next_state =
            EventBuilder::new(Kind::Custom(buzz_core::kind::KIND_TASK_STATE as u16), "")
                .tags([Tag::parse(["d", &task_id.to_string()]).unwrap()])
                .sign_with_keys(&relay)
                .unwrap();
        let stale = [9_u8; 32];
        assert!(matches!(
            apply_task_events(
                &pool,
                community,
                task_id,
                Some(&stale),
                &mutation,
                &next_state,
                None
            )
            .await,
            Err(DbError::Conflict(_))
        ));
        let persisted: i64 =
            sqlx::query_scalar("SELECT count(*) FROM events WHERE community_id = $1 AND id = $2")
                .bind(community.as_uuid())
                .bind(mutation.id.as_bytes().as_slice())
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(persisted, 0, "conflicting mutation must not be stored");
    }

    #[tokio::test]
    #[ignore = "requires PostgreSQL with current migrations"]
    async fn completed_execution_allows_a_new_execution_but_active_execution_blocks_another() {
        let (pool, community) = setup().await;
        let actor = Keys::generate();
        let relay = Keys::generate();
        let task_id = Uuid::new_v4();
        let first_id = Uuid::new_v4();
        let second_id = Uuid::new_v4();
        let third_id = Uuid::new_v4();

        let execution_event = |keys: &Keys, execution_id: Uuid, status: &str| {
            EventBuilder::new(
                Kind::Custom(buzz_core::kind::KIND_TASK_EXECUTION_STATE as u16),
                "",
            )
            .tags([
                Tag::parse(["d", &execution_id.to_string()]).unwrap(),
                Tag::parse(["t", &format!("task-id:{task_id}")]).unwrap(),
                Tag::parse(["status", status]).unwrap(),
            ])
            .sign_with_keys(keys)
            .unwrap()
        };
        let command_event = |execution_id: Uuid, status: &str, request: bool| {
            EventBuilder::new(
                Kind::Custom(
                    (if request {
                        buzz_core::kind::KIND_TASK_EXECUTION_REQUEST
                    } else {
                        buzz_core::kind::KIND_TASK_EXECUTION_UPDATE
                    }) as u16,
                ),
                "",
            )
            .tags([
                Tag::parse(["d", &execution_id.to_string()]).unwrap(),
                Tag::parse(["t", &format!("task-id:{task_id}")]).unwrap(),
                Tag::parse(["status", status]).unwrap(),
            ])
            .sign_with_keys(&actor)
            .unwrap()
        };

        let first_request = command_event(first_id, "queued", true);
        let first_queued = execution_event(&relay, first_id, "queued");
        assert_eq!(
            apply_task_execution_events(
                &pool,
                community,
                task_id,
                first_id,
                &first_request,
                &first_queued,
                None,
                true,
            )
            .await
            .unwrap(),
            ApplyTaskResult::Applied
        );

        let first_running_command = command_event(first_id, "running", false);
        let first_running = execution_event(&relay, first_id, "running");
        apply_task_execution_events(
            &pool,
            community,
            task_id,
            first_id,
            &first_running_command,
            &first_running,
            None,
            false,
        )
        .await
        .unwrap();
        let first_finished_command = command_event(first_id, "finished", false);
        let first_finished = execution_event(&relay, first_id, "finished");
        apply_task_execution_events(
            &pool,
            community,
            task_id,
            first_id,
            &first_finished_command,
            &first_finished,
            None,
            false,
        )
        .await
        .unwrap();

        let second_request = command_event(second_id, "queued", true);
        let second_queued = execution_event(&relay, second_id, "queued");
        assert_eq!(
            apply_task_execution_events(
                &pool,
                community,
                task_id,
                second_id,
                &second_request,
                &second_queued,
                None,
                true,
            )
            .await
            .unwrap(),
            ApplyTaskResult::Applied
        );

        let third_request = command_event(third_id, "queued", true);
        let third_queued = execution_event(&relay, third_id, "queued");
        assert!(matches!(
            apply_task_execution_events(
                &pool,
                community,
                task_id,
                third_id,
                &third_request,
                &third_queued,
                None,
                true,
            )
            .await,
            Err(DbError::Conflict(message)) if message == "task already has an active execution"
        ));

        let second_cancel_command = command_event(second_id, "cancelled", false);
        let second_cancelled = execution_event(&relay, second_id, "cancelled");
        apply_task_execution_events(
            &pool,
            community,
            task_id,
            second_id,
            &second_cancel_command,
            &second_cancelled,
            None,
            false,
        )
        .await
        .unwrap();
        assert_eq!(
            apply_task_execution_events(
                &pool,
                community,
                task_id,
                third_id,
                &third_request,
                &third_queued,
                None,
                true,
            )
            .await
            .unwrap(),
            ApplyTaskResult::Applied
        );

        let visible_execution_ids: Vec<String> = sqlx::query_scalar(
            "SELECT d_tag FROM events WHERE community_id = $1 AND kind = $2 \
             AND deleted_at IS NULL AND tags @> $3 ORDER BY d_tag",
        )
        .bind(community.as_uuid())
        .bind(buzz_core::kind::KIND_TASK_EXECUTION_STATE as i32)
        .bind(serde_json::json!([["t", format!("task-id:{task_id}")]]))
        .fetch_all(&pool)
        .await
        .unwrap();
        let mut expected = vec![
            first_id.to_string(),
            second_id.to_string(),
            third_id.to_string(),
        ];
        expected.sort();
        assert_eq!(visible_execution_ids, expected);
    }

    #[tokio::test]
    #[ignore = "requires PostgreSQL with current migrations"]
    async fn delete_hides_state_and_history_and_blocks_recreation() {
        let (pool, community) = setup().await;
        let actor = Keys::generate();
        let relay = Keys::generate();
        let task_id = Uuid::new_v4();
        let task_tag = Tag::parse(["t", &format!("task-id:{task_id}")]).unwrap();
        let create = EventBuilder::new(
            Kind::Custom(buzz_core::kind::KIND_TASK_CREATE as u16),
            "secret",
        )
        .tags([task_tag.clone()])
        .sign_with_keys(&actor)
        .unwrap();
        let state = EventBuilder::new(
            Kind::Custom(buzz_core::kind::KIND_TASK_STATE as u16),
            "secret",
        )
        .tags([Tag::parse(["d", &task_id.to_string()]).unwrap()])
        .sign_with_keys(&relay)
        .unwrap();
        apply_task_events(&pool, community, task_id, None, &create, &state, None)
            .await
            .unwrap();
        let marker = EventBuilder::new(Kind::Custom(buzz_core::kind::KIND_TASK_DELETE as u16), "")
            .tags([
                task_tag.clone(),
                Tag::parse(["previous", &state.id.to_hex()]).unwrap(),
            ])
            .sign_with_keys(&actor)
            .unwrap();
        assert_eq!(
            delete_task_events(
                &pool,
                community,
                task_id,
                state.id.as_bytes().as_slice(),
                &marker,
                None,
            )
            .await
            .unwrap(),
            DeleteTaskResult::Deleted
        );
        let visible_task_rows: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM events WHERE community_id = $1 AND deleted_at IS NULL \
             AND (id = $2 OR id = $3)",
        )
        .bind(community.as_uuid())
        .bind(create.id.as_bytes().as_slice())
        .bind(state.id.as_bytes().as_slice())
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(visible_task_rows, 0);
        let visible_marker: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM events WHERE community_id = $1 AND id = $2 AND deleted_at IS NULL",
        )
        .bind(community.as_uuid())
        .bind(marker.id.as_bytes().as_slice())
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(visible_marker, 1);

        // The marker itself may later be hidden by a generic deletion event.
        // Its durable row must still fence this task ID forever.
        sqlx::query("UPDATE events SET deleted_at = NOW() WHERE community_id = $1 AND id = $2")
            .bind(community.as_uuid())
            .bind(marker.id.as_bytes().as_slice())
            .execute(&pool)
            .await
            .unwrap();

        let recreate =
            EventBuilder::new(Kind::Custom(buzz_core::kind::KIND_TASK_CREATE as u16), "")
                .tags([task_tag])
                .sign_with_keys(&actor)
                .unwrap();
        let recreated_state =
            EventBuilder::new(Kind::Custom(buzz_core::kind::KIND_TASK_STATE as u16), "")
                .tags([Tag::parse(["d", &task_id.to_string()]).unwrap()])
                .sign_with_keys(&relay)
                .unwrap();
        assert!(matches!(
            apply_task_events(&pool, community, task_id, None, &recreate, &recreated_state, None).await,
            Err(DbError::Conflict(message)) if message == "task id was soft-deleted"
        ));
    }
}
