//! Atomic persistence for Buzz Tracks command and derived state events.

use buzz_core::CommunityId;
use nostr::Event;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::error::{DbError, Result};

/// Result of atomically applying a Track command.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApplyTrackResult {
    /// Command and new state were inserted.
    Applied,
    /// This exact command was already processed.
    Duplicate,
}

/// Store an actor command and replace its relay-signed Track State under one lock.
pub async fn apply_track_events(
    pool: &PgPool,
    community_id: CommunityId,
    track_id: Uuid,
    expected_state_id: Option<&[u8]>,
    command: &Event,
    state: &Event,
) -> Result<ApplyTrackResult> {
    let mut tx = pool.begin().await?;
    let lock_key = i64::from_le_bytes(
        track_id.as_bytes()[..8]
            .try_into()
            .map_err(|_| DbError::InvalidData("track UUID could not produce lock key".into()))?,
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
        return Ok(ApplyTrackResult::Duplicate);
    }

    let current = sqlx::query(
        "SELECT id FROM events WHERE community_id = $1 AND kind = $2 AND d_tag = $3 \
         AND deleted_at IS NULL FOR UPDATE",
    )
    .bind(community_id.as_uuid())
    .bind(buzz_core::kind::KIND_TRACK_STATE as i32)
    .bind(track_id.to_string())
    .fetch_optional(tx.as_mut())
    .await?;
    let current_id = current.map(|row| row.get::<Vec<u8>, _>("id"));
    match (expected_state_id, current_id.as_deref()) {
        (None, None) => {}
        (None, Some(_)) => return Err(DbError::Conflict("track already exists".into())),
        (Some(_), None) => return Err(DbError::Conflict("track state no longer exists".into())),
        (Some(expected), Some(current)) if expected == current => {}
        (Some(_), Some(_)) => return Err(DbError::Conflict("track state changed".into())),
    }

    insert_raw(&mut tx, community_id, command, None).await?;
    if current_id.is_some() {
        sqlx::query(
            "UPDATE events SET deleted_at = NOW() WHERE community_id = $1 AND kind = $2 \
             AND d_tag = $3 AND deleted_at IS NULL",
        )
        .bind(community_id.as_uuid())
        .bind(buzz_core::kind::KIND_TRACK_STATE as i32)
        .bind(track_id.to_string())
        .execute(tx.as_mut())
        .await?;
    }
    insert_raw(&mut tx, community_id, state, Some(track_id.to_string())).await?;
    tx.commit().await?;
    Ok(ApplyTrackResult::Applied)
}

async fn insert_raw(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    community_id: CommunityId,
    event: &Event,
    d_tag: Option<String>,
) -> Result<()> {
    let created_at = chrono::DateTime::from_timestamp(event.created_at.as_secs() as i64, 0)
        .ok_or(DbError::InvalidTimestamp(event.created_at.as_secs() as i64))?;
    sqlx::query(
        "INSERT INTO events (community_id,id,pubkey,created_at,kind,tags,content,sig,received_at,channel_id,d_tag) \
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NULL,$9)",
    )
    .bind(community_id.as_uuid())
    .bind(event.id.as_bytes().as_slice())
    .bind(event.pubkey.to_bytes().as_slice())
    .bind(created_at)
    .bind(event.kind.as_u16() as i32)
    .bind(serde_json::to_value(&event.tags)?)
    .bind(&event.content)
    .bind(event.sig.serialize().as_slice())
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
        let pool = PgPool::connect(&url).await.expect("connect test database");
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO communities (id, host) VALUES ($1, $2)")
            .bind(id)
            .bind(format!("track-atomic-{}.example", id.simple()))
            .execute(&pool)
            .await
            .expect("insert test community");
        (pool, CommunityId::from_uuid(id))
    }

    #[tokio::test]
    #[ignore = "requires PostgreSQL with current migrations"]
    async fn stale_head_does_not_store_track_mutation() {
        let (pool, community) = setup().await;
        let actor = Keys::generate();
        let relay = Keys::generate();
        let track_id = Uuid::new_v4();
        let command =
            EventBuilder::new(Kind::Custom(buzz_core::kind::KIND_TRACK_CREATE as u16), "")
                .tags([Tag::parse(["t", &format!("track-id:{track_id}")]).unwrap()])
                .sign_with_keys(&actor)
                .unwrap();
        let state = EventBuilder::new(Kind::Custom(buzz_core::kind::KIND_TRACK_STATE as u16), "")
            .tags([Tag::parse(["d", &track_id.to_string()]).unwrap()])
            .sign_with_keys(&relay)
            .unwrap();
        apply_track_events(&pool, community, track_id, None, &command, &state)
            .await
            .unwrap();

        let mutation =
            EventBuilder::new(Kind::Custom(buzz_core::kind::KIND_TRACK_MUTATE as u16), "")
                .tags([Tag::parse(["t", &format!("track-id:{track_id}")]).unwrap()])
                .sign_with_keys(&actor)
                .unwrap();
        let next_state =
            EventBuilder::new(Kind::Custom(buzz_core::kind::KIND_TRACK_STATE as u16), "")
                .tags([Tag::parse(["d", &track_id.to_string()]).unwrap()])
                .sign_with_keys(&relay)
                .unwrap();
        assert!(matches!(
            apply_track_events(
                &pool,
                community,
                track_id,
                Some(&[7_u8; 32]),
                &mutation,
                &next_state
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
        assert_eq!(persisted, 0);
    }

    #[tokio::test]
    #[ignore = "requires PostgreSQL with current migrations"]
    async fn concurrent_mutations_allow_exactly_one_head_replacement() {
        let (pool, community) = setup().await;
        let actor = Keys::generate();
        let relay = Keys::generate();
        let track_id = Uuid::new_v4();
        let create = EventBuilder::new(Kind::Custom(buzz_core::kind::KIND_TRACK_CREATE as u16), "")
            .tags([Tag::parse(["t", &format!("track-id:{track_id}")]).unwrap()])
            .sign_with_keys(&actor)
            .unwrap();
        let initial = EventBuilder::new(Kind::Custom(buzz_core::kind::KIND_TRACK_STATE as u16), "")
            .tags([Tag::parse(["d", &track_id.to_string()]).unwrap()])
            .sign_with_keys(&relay)
            .unwrap();
        apply_track_events(&pool, community, track_id, None, &create, &initial)
            .await
            .unwrap();

        let mutation = |content: &str| {
            EventBuilder::new(
                Kind::Custom(buzz_core::kind::KIND_TRACK_MUTATE as u16),
                content,
            )
            .tags([Tag::parse(["t", &format!("track-id:{track_id}")]).unwrap()])
            .sign_with_keys(&actor)
            .unwrap()
        };
        let next_state = |content: &str| {
            EventBuilder::new(
                Kind::Custom(buzz_core::kind::KIND_TRACK_STATE as u16),
                content,
            )
            .tags([Tag::parse(["d", &track_id.to_string()]).unwrap()])
            .sign_with_keys(&relay)
            .unwrap()
        };
        let command_a = mutation("a");
        let command_b = mutation("b");
        let state_a = next_state("a");
        let state_b = next_state("b");
        let expected = initial.id.as_bytes().to_vec();
        let (a, b) = tokio::join!(
            apply_track_events(
                &pool,
                community,
                track_id,
                Some(&expected),
                &command_a,
                &state_a
            ),
            apply_track_events(
                &pool,
                community,
                track_id,
                Some(&expected),
                &command_b,
                &state_b
            )
        );
        let applied = [a, b]
            .into_iter()
            .filter(|result| matches!(result, Ok(ApplyTrackResult::Applied)))
            .count();
        assert_eq!(applied, 1);
    }
}
