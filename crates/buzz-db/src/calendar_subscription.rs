//! Community-scoped storage for private iCalendar feed subscriptions.

use buzz_core::{CommunityId, StoredEvent};
use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row as _};

use crate::error::{DbError, Result};

/// Public, non-secret state for an owner's active subscription.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CalendarSubscriptionStatus {
    /// When the active credential was created.
    pub created_at: DateTime<Utc>,
    /// Most recent successful feed lookup, if any.
    pub last_used_at: Option<DateTime<Utc>>,
}

/// The owner resolved from an active token hash.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CalendarSubscriptionToken {
    /// Owner whose personal and owned-Agent calendars the token may read.
    pub owner_pubkey: Vec<u8>,
    /// When this credential was created.
    pub created_at: DateTime<Utc>,
    /// Most recent successful feed lookup, if any.
    pub last_used_at: Option<DateTime<Utc>>,
}

/// Result of creating a subscription without replacing an existing one.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CreateCalendarSubscriptionOutcome {
    /// A new active credential was stored.
    Created(CalendarSubscriptionStatus),
    /// The owner already has an active credential; the supplied hash was not stored.
    AlreadyActive(CalendarSubscriptionStatus),
}

fn validate_pubkey(pubkey: &[u8]) -> Result<()> {
    if pubkey.len() != 32 {
        return Err(DbError::InvalidData(
            "calendar owner pubkey must be 32 bytes".into(),
        ));
    }
    Ok(())
}

async fn lock_owner(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    community_id: CommunityId,
    owner_pubkey: &[u8],
) -> Result<()> {
    // Two-key advisory locks avoid building a lossy application-side i64 hash.
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))")
        .bind(community_id.to_string())
        .bind(hex::encode(owner_pubkey))
        .execute(&mut **tx)
        .await?;
    Ok(())
}

fn status_from_row(row: &sqlx::postgres::PgRow) -> Result<CalendarSubscriptionStatus> {
    Ok(CalendarSubscriptionStatus {
        created_at: row.try_get("created_at")?,
        last_used_at: row.try_get("last_used_at")?,
    })
}

/// Create a credential if the owner does not already have an active one.
pub async fn create_calendar_subscription(
    pool: &PgPool,
    community_id: CommunityId,
    owner_pubkey: &[u8],
    token_hash: &[u8; 32],
) -> Result<CreateCalendarSubscriptionOutcome> {
    validate_pubkey(owner_pubkey)?;
    let mut tx = pool.begin().await?;
    lock_owner(&mut tx, community_id, owner_pubkey).await?;

    let existing = sqlx::query(
        "SELECT created_at, last_used_at FROM calendar_subscription_tokens \
         WHERE community_id = $1 AND owner_pubkey = $2 AND revoked_at IS NULL",
    )
    .bind(community_id.as_uuid())
    .bind(owner_pubkey)
    .fetch_optional(&mut *tx)
    .await?;
    if let Some(row) = existing {
        let status = status_from_row(&row)?;
        tx.commit().await?;
        return Ok(CreateCalendarSubscriptionOutcome::AlreadyActive(status));
    }

    let row = sqlx::query(
        "INSERT INTO calendar_subscription_tokens (community_id, owner_pubkey, token_hash) \
         VALUES ($1, $2, $3) RETURNING created_at, last_used_at",
    )
    .bind(community_id.as_uuid())
    .bind(owner_pubkey)
    .bind(token_hash.as_slice())
    .fetch_one(&mut *tx)
    .await?;
    let status = status_from_row(&row)?;
    tx.commit().await?;
    Ok(CreateCalendarSubscriptionOutcome::Created(status))
}

/// Return the non-secret state of an owner's active subscription.
pub async fn calendar_subscription_status(
    pool: &PgPool,
    community_id: CommunityId,
    owner_pubkey: &[u8],
) -> Result<Option<CalendarSubscriptionStatus>> {
    validate_pubkey(owner_pubkey)?;
    let row = sqlx::query(
        "SELECT created_at, last_used_at FROM calendar_subscription_tokens \
         WHERE community_id = $1 AND owner_pubkey = $2 AND revoked_at IS NULL",
    )
    .bind(community_id.as_uuid())
    .bind(owner_pubkey)
    .fetch_optional(pool)
    .await?;
    row.as_ref().map(status_from_row).transpose()
}

/// Atomically revoke the current credential and install a replacement.
pub async fn rotate_calendar_subscription(
    pool: &PgPool,
    community_id: CommunityId,
    owner_pubkey: &[u8],
    new_token_hash: &[u8; 32],
) -> Result<CalendarSubscriptionStatus> {
    validate_pubkey(owner_pubkey)?;
    let mut tx = pool.begin().await?;
    lock_owner(&mut tx, community_id, owner_pubkey).await?;
    sqlx::query(
        "UPDATE calendar_subscription_tokens SET revoked_at = NOW() \
         WHERE community_id = $1 AND owner_pubkey = $2 AND revoked_at IS NULL",
    )
    .bind(community_id.as_uuid())
    .bind(owner_pubkey)
    .execute(&mut *tx)
    .await?;
    let row = sqlx::query(
        "INSERT INTO calendar_subscription_tokens (community_id, owner_pubkey, token_hash) \
         VALUES ($1, $2, $3) RETURNING created_at, last_used_at",
    )
    .bind(community_id.as_uuid())
    .bind(owner_pubkey)
    .bind(new_token_hash.as_slice())
    .fetch_one(&mut *tx)
    .await?;
    let status = status_from_row(&row)?;
    tx.commit().await?;
    Ok(status)
}

/// Revoke an owner's active credential. Repeated calls are successful no-ops.
pub async fn revoke_calendar_subscription(
    pool: &PgPool,
    community_id: CommunityId,
    owner_pubkey: &[u8],
) -> Result<bool> {
    validate_pubkey(owner_pubkey)?;
    let mut tx = pool.begin().await?;
    lock_owner(&mut tx, community_id, owner_pubkey).await?;
    let changed = sqlx::query(
        "UPDATE calendar_subscription_tokens SET revoked_at = NOW() \
         WHERE community_id = $1 AND owner_pubkey = $2 AND revoked_at IS NULL",
    )
    .bind(community_id.as_uuid())
    .bind(owner_pubkey)
    .execute(&mut *tx)
    .await?
    .rows_affected()
        > 0;
    tx.commit().await?;
    Ok(changed)
}

/// Resolve an active hash inside the already resolved community.
pub async fn resolve_calendar_subscription(
    pool: &PgPool,
    community_id: CommunityId,
    token_hash: &[u8; 32],
) -> Result<Option<CalendarSubscriptionToken>> {
    let row = sqlx::query(
        "SELECT token.owner_pubkey, token.created_at, token.last_used_at \
         FROM calendar_subscription_tokens token \
         JOIN users owner ON owner.community_id = token.community_id \
                         AND owner.pubkey = token.owner_pubkey \
                         AND owner.deactivated_at IS NULL \
         WHERE token.community_id = $1 AND token.token_hash = $2 \
           AND token.revoked_at IS NULL",
    )
    .bind(community_id.as_uuid())
    .bind(token_hash.as_slice())
    .fetch_optional(pool)
    .await?;
    row.map(|row| {
        Ok(CalendarSubscriptionToken {
            owner_pubkey: row.try_get("owner_pubkey")?,
            created_at: row.try_get("created_at")?,
            last_used_at: row.try_get("last_used_at")?,
        })
    })
    .transpose()
}

/// Record successful use of an active community-scoped credential.
pub async fn touch_calendar_subscription(
    pool: &PgPool,
    community_id: CommunityId,
    token_hash: &[u8; 32],
) -> Result<()> {
    sqlx::query(
        "UPDATE calendar_subscription_tokens SET last_used_at = NOW() \
         WHERE community_id = $1 AND token_hash = $2 AND revoked_at IS NULL",
    )
    .bind(community_id.as_uuid())
    .bind(token_hash.as_slice())
    .execute(pool)
    .await?;
    Ok(())
}

/// Return all live NIP-52 event heads authored by the owner or an owned Agent.
pub async fn calendar_subscription_events(
    pool: &PgPool,
    community_id: CommunityId,
    owner_pubkey: &[u8],
) -> Result<Vec<StoredEvent>> {
    validate_pubkey(owner_pubkey)?;
    let rows = sqlx::query(
        "SELECT event.id, event.pubkey, event.created_at, event.kind, event.tags, \
                event.content, event.sig, event.received_at, event.channel_id \
         FROM events event \
         WHERE event.community_id = $1 \
           AND event.deleted_at IS NULL \
           AND event.kind IN (31922, 31923) \
           AND (event.pubkey = $2 OR EXISTS ( \
               SELECT 1 FROM users agent \
               WHERE agent.community_id = event.community_id \
                 AND agent.pubkey = event.pubkey \
                 AND agent.agent_owner_pubkey = $2 \
                 AND agent.deactivated_at IS NULL \
           )) \
         ORDER BY event.calendar_start ASC NULLS LAST, event.kind ASC, \
                  event.pubkey ASC, event.d_tag ASC, event.created_at DESC, event.id ASC",
    )
    .bind(community_id.as_uuid())
    .bind(owner_pubkey)
    .fetch_all(pool)
    .await?;

    rows.into_iter()
        .filter_map(|row| match crate::event::row_to_stored_event(row) {
            Ok(Some(event)) => Some(Ok(event)),
            Ok(None) => None,
            Err(error) => Some(Err(error)),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use nostr::{EventBuilder, Keys, Kind, Tag};
    use uuid::Uuid;

    const TEST_DB_URL: &str = "postgres://buzz:buzz_dev@localhost:5432/buzz";

    async fn setup_pool() -> PgPool {
        PgPool::connect(TEST_DB_URL)
            .await
            .expect("connect to test database")
    }

    async fn tenant_with_owner(pool: &PgPool, marker: u8) -> (CommunityId, Vec<u8>) {
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO communities (id, host) VALUES ($1, $2)")
            .bind(id)
            .bind(format!("calendar-subscription-{}.example", id.simple()))
            .execute(pool)
            .await
            .expect("insert community");
        let owner = vec![marker; 32];
        sqlx::query("INSERT INTO users (community_id, pubkey) VALUES ($1, $2)")
            .bind(id)
            .bind(&owner)
            .execute(pool)
            .await
            .expect("insert owner");
        (CommunityId::from_uuid(id), owner)
    }

    #[tokio::test]
    #[ignore = "requires Postgres"]
    async fn lifecycle_keeps_only_hash_and_invalidates_old_token() {
        let pool = setup_pool().await;
        let (community, owner) = tenant_with_owner(&pool, 0x11).await;
        let first = [0x22; 32];
        let second = [0x33; 32];

        assert!(matches!(
            create_calendar_subscription(&pool, community, &owner, &first)
                .await
                .expect("create"),
            CreateCalendarSubscriptionOutcome::Created(_)
        ));
        assert!(resolve_calendar_subscription(&pool, community, &first)
            .await
            .expect("resolve first")
            .is_some());

        rotate_calendar_subscription(&pool, community, &owner, &second)
            .await
            .expect("rotate");
        assert!(resolve_calendar_subscription(&pool, community, &first)
            .await
            .expect("old lookup")
            .is_none());
        assert!(resolve_calendar_subscription(&pool, community, &second)
            .await
            .expect("new lookup")
            .is_some());
        assert!(revoke_calendar_subscription(&pool, community, &owner)
            .await
            .expect("revoke"));
        assert!(!revoke_calendar_subscription(&pool, community, &owner)
            .await
            .expect("idempotent revoke"));
    }

    #[tokio::test]
    #[ignore = "requires Postgres"]
    async fn identical_hash_is_resolved_only_inside_requested_community() {
        let pool = setup_pool().await;
        let (community_a, owner_a) = tenant_with_owner(&pool, 0x41).await;
        let (community_b, owner_b) = tenant_with_owner(&pool, 0x42).await;
        let shared_hash = [0x55; 32];
        create_calendar_subscription(&pool, community_a, &owner_a, &shared_hash)
            .await
            .expect("create A");
        create_calendar_subscription(&pool, community_b, &owner_b, &shared_hash)
            .await
            .expect("create B");

        let found_a = resolve_calendar_subscription(&pool, community_a, &shared_hash)
            .await
            .expect("resolve A")
            .expect("A row");
        let found_b = resolve_calendar_subscription(&pool, community_b, &shared_hash)
            .await
            .expect("resolve B")
            .expect("B row");
        assert_eq!(found_a.owner_pubkey, owner_a);
        assert_eq!(found_b.owner_pubkey, owner_b);
    }

    #[tokio::test]
    #[ignore = "requires Postgres"]
    async fn concurrent_create_produces_one_active_credential() {
        let pool = setup_pool().await;
        let (community, owner) = tenant_with_owner(&pool, 0x61).await;
        let pool_b = pool.clone();
        let owner_b = owner.clone();
        let (left, right) = tokio::join!(
            create_calendar_subscription(&pool, community, &owner, &[0x71; 32]),
            create_calendar_subscription(&pool_b, community, &owner_b, &[0x72; 32]),
        );
        let outcomes = [left.expect("first create"), right.expect("second create")];
        assert_eq!(
            outcomes
                .iter()
                .filter(|outcome| matches!(outcome, CreateCalendarSubscriptionOutcome::Created(_)))
                .count(),
            1
        );
        let active: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM calendar_subscription_tokens \
             WHERE community_id = $1 AND owner_pubkey = $2 AND revoked_at IS NULL",
        )
        .bind(community.as_uuid())
        .bind(owner)
        .fetch_one(&pool)
        .await
        .expect("count active");
        assert_eq!(active, 1);
    }

    async fn add_user(pool: &PgPool, community: CommunityId, keys: &Keys, owner: Option<&[u8]>) {
        sqlx::query(
            "INSERT INTO users (community_id, pubkey, agent_owner_pubkey) VALUES ($1, $2, $3)",
        )
        .bind(community.as_uuid())
        .bind(keys.public_key().to_bytes().as_slice())
        .bind(owner)
        .execute(pool)
        .await
        .expect("insert calendar author");
    }

    fn calendar_event(keys: &Keys, coordinate: &str, title: &str) -> nostr::Event {
        EventBuilder::new(Kind::Custom(31923), "description")
            .tags([
                Tag::parse(["d", coordinate]).expect("d tag"),
                Tag::parse(["title", title]).expect("title tag"),
                Tag::parse(["start", "1787616000"]).expect("start tag"),
                Tag::parse(["end", "1787619600"]).expect("end tag"),
            ])
            .sign_with_keys(keys)
            .expect("sign calendar event")
    }

    #[tokio::test]
    #[ignore = "requires Postgres"]
    async fn event_query_includes_personal_and_owned_agent_heads_only() {
        let pool = setup_pool().await;
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO communities (id, host) VALUES ($1, $2)")
            .bind(id)
            .bind(format!("calendar-events-{}.example", id.simple()))
            .execute(&pool)
            .await
            .expect("insert community");
        let community = CommunityId::from_uuid(id);
        let owner = Keys::generate();
        let owned_agent = Keys::generate();
        let foreign_agent = Keys::generate();
        add_user(&pool, community, &owner, None).await;
        let owner_bytes = owner.public_key().to_bytes();
        add_user(&pool, community, &owned_agent, Some(owner_bytes.as_slice())).await;
        add_user(&pool, community, &foreign_agent, None).await;

        let db = crate::Db::from_pool(pool.clone());
        for (keys, coordinate, title) in [
            (&owner, "personal", "Personal"),
            (&owned_agent, "owned", "Owned"),
            (&foreign_agent, "foreign", "Foreign"),
        ] {
            db.replace_parameterized_event(
                community,
                &calendar_event(keys, coordinate, title),
                coordinate,
                None,
            )
            .await
            .expect("store calendar event");
        }

        let events = calendar_subscription_events(&pool, community, owner_bytes.as_slice())
            .await
            .expect("query feed events");
        let authors = events
            .iter()
            .map(|event| event.event.pubkey)
            .collect::<Vec<_>>();
        assert_eq!(events.len(), 2);
        assert!(authors.contains(&owner.public_key()));
        assert!(authors.contains(&owned_agent.public_key()));
        assert!(!authors.contains(&foreign_agent.public_key()));
    }
}
