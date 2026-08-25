//! Private, read-only iCalendar subscriptions for a user's Buzz events.

use std::sync::Arc;

use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Json, Response},
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{DateTime, NaiveDate, Utc};
use rand::RngExt;
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::icalendar::{self, CalendarEvent, CalendarTime};
use crate::state::AppState;

use super::{api_error, bridge, internal_error, relay_members};

const STATUS_PATH: &str = "/api/calendar/subscription";
const REGENERATE_PATH: &str = "/api/calendar/subscription/regenerate";

#[derive(Serialize)]
struct SubscriptionResponse {
    active: bool,
    created_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    https_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    webcal_url: Option<String>,
}

/// Return whether the authenticated user has an active subscription.
pub async fn subscription_status(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<impl Serialize>, (StatusCode, Json<Value>)> {
    let (tenant, owner) = authenticate(&state, &headers, "GET", STATUS_PATH).await?;
    let status = state
        .db
        .calendar_subscription_status(tenant.community(), owner.as_bytes())
        .await
        .map_err(|error| internal_error(&format!("calendar subscription status: {error}")))?;
    Ok(Json(SubscriptionResponse {
        active: status.is_some(),
        created_at: status.map(|value| value.created_at),
        https_url: None,
        webcal_url: None,
    }))
}

/// Create a private subscription and reveal its bearer URL exactly once.
pub async fn create_subscription(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<impl Serialize>, (StatusCode, Json<Value>)> {
    let (tenant, owner) = authenticate(&state, &headers, "POST", STATUS_PATH).await?;
    let (token, hash) = generate_token();
    let outcome = state
        .db
        .create_calendar_subscription(tenant.community(), owner.as_bytes(), &hash)
        .await
        .map_err(|error| internal_error(&format!("calendar subscription create: {error}")))?;
    let status = match outcome {
        buzz_db::CreateCalendarSubscriptionOutcome::Created(status) => status,
        buzz_db::CreateCalendarSubscriptionOutcome::AlreadyActive(_) => {
            return Err(api_error(
                StatusCode::CONFLICT,
                "subscription already active",
            ));
        }
    };
    Ok(Json(secret_response(
        tenant.host(),
        token,
        status.created_at,
    )))
}

/// Atomically replace any active subscription with a new private URL.
pub async fn regenerate_subscription(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<impl Serialize>, (StatusCode, Json<Value>)> {
    let (tenant, owner) = authenticate(&state, &headers, "POST", REGENERATE_PATH).await?;
    let (token, hash) = generate_token();
    let status = state
        .db
        .rotate_calendar_subscription(tenant.community(), owner.as_bytes(), &hash)
        .await
        .map_err(|error| internal_error(&format!("calendar subscription rotate: {error}")))?;
    Ok(Json(secret_response(
        tenant.host(),
        token,
        status.created_at,
    )))
}

/// Revoke the authenticated user's active subscription, idempotently.
pub async fn revoke_subscription(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<impl Serialize>, (StatusCode, Json<Value>)> {
    let (tenant, owner) = authenticate(&state, &headers, "DELETE", STATUS_PATH).await?;
    state
        .db
        .revoke_calendar_subscription(tenant.community(), owner.as_bytes())
        .await
        .map_err(|error| internal_error(&format!("calendar subscription revoke: {error}")))?;
    Ok(Json(SubscriptionResponse {
        active: false,
        created_at: None,
        https_url: None,
        webcal_url: None,
    }))
}

/// Serve the private RFC 5545 feed. Every invalid-token outcome is the same 404.
pub async fn calendar_feed(
    State(state): State<Arc<AppState>>,
    Path(token): Path<String>,
    headers: HeaderMap,
) -> Response {
    match calendar_feed_inner(&state, &token, &headers).await {
        Ok(response) => response,
        Err(status) => status.into_response(),
    }
}

async fn calendar_feed_inner(
    state: &AppState,
    filename: &str,
    headers: &HeaderMap,
) -> Result<Response, StatusCode> {
    let token = filename.strip_suffix(".ics").ok_or(StatusCode::NOT_FOUND)?;
    let raw_host = headers
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    let tenant = crate::tenant::bind_community(&state.db, raw_host)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;
    let raw = URL_SAFE_NO_PAD
        .decode(token)
        .map_err(|_| StatusCode::NOT_FOUND)?;
    if raw.len() != 32 {
        return Err(StatusCode::NOT_FOUND);
    }
    let hash: [u8; 32] = Sha256::digest(&raw).into();
    let subscription = state
        .db
        .resolve_calendar_subscription(tenant.community(), &hash)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;
    let events = state
        .db
        .calendar_subscription_events(tenant.community(), &subscription.owner_pubkey)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mapped = events.iter().filter_map(map_stored_event).collect();
    let snapshot = icalendar::render_calendar(tenant.host(), mapped).map_err(|error| {
        tracing::warn!(community = %tenant.community(), error = %error, "calendar feed rejected");
        StatusCode::SERVICE_UNAVAILABLE
    })?;
    if snapshot.skipped > 0 {
        tracing::warn!(
            community = %tenant.community(),
            skipped = snapshot.skipped,
            "calendar feed skipped malformed events"
        );
    }
    // Usage tracking is deliberately best effort and occurs only after successful resolution.
    if let Err(error) = state
        .db
        .touch_calendar_subscription(tenant.community(), &hash)
        .await
    {
        tracing::warn!(community = %tenant.community(), error = %error, "calendar subscription touch failed");
    }
    if headers
        .get(header::IF_NONE_MATCH)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.split(',').any(|tag| tag.trim() == snapshot.etag))
    {
        return Response::builder()
            .status(StatusCode::NOT_MODIFIED)
            .header(header::ETAG, snapshot.etag)
            .header(header::CACHE_CONTROL, "private, no-cache")
            .body(Body::empty())
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR);
    }
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/calendar; charset=utf-8")
        .header(
            header::CONTENT_DISPOSITION,
            "inline; filename=\"buzz-calendar.ics\"",
        )
        .header(header::CACHE_CONTROL, "private, no-cache")
        .header(header::ETAG, snapshot.etag)
        .body(Body::from(snapshot.body))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn authenticate(
    state: &Arc<AppState>,
    headers: &HeaderMap,
    method: &str,
    path: &str,
) -> Result<(buzz_core::TenantContext, nostr::PublicKey), (StatusCode, Json<Value>)> {
    let raw_host = headers
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    let tenant = crate::tenant::bind_community(&state.db, raw_host)
        .await
        .map_err(|_| api_error(StatusCode::NOT_FOUND, "community not found"))?;
    let url = bridge::nip98_expected_url(&state.config.relay_url, &tenant, path);
    let (pubkey, event_id) =
        bridge::verify_bridge_auth_with_options(headers, method, &url, None, true, false)?;
    bridge::enforce_http_admission(state, &tenant, &pubkey).await?;
    bridge::check_nip98_replay(state, &tenant, event_id).await?;
    relay_members::enforce_relay_membership(state, tenant.community(), pubkey.as_bytes(), None)
        .await?;
    Ok((tenant, pubkey))
}

fn generate_token() -> (String, [u8; 32]) {
    let mut raw = [0u8; 32];
    rand::rng().fill(&mut raw);
    let token = URL_SAFE_NO_PAD.encode(raw);
    let hash = Sha256::digest(raw).into();
    (token, hash)
}

fn secret_response(host: &str, token: String, created_at: DateTime<Utc>) -> SubscriptionResponse {
    let path = format!("{host}/calendar/subscriptions/{token}.ics");
    SubscriptionResponse {
        active: true,
        created_at: Some(created_at),
        https_url: Some(format!("https://{path}")),
        webcal_url: Some(format!("webcal://{path}")),
    }
}

fn map_stored_event(stored: &buzz_core::StoredEvent) -> Option<CalendarEvent> {
    let event = &stored.event;
    let kind = event.kind.as_u16();
    let tag = |name: &str| {
        event.tags.iter().find_map(|tag| {
            let parts = tag.as_slice();
            (parts.first().map(String::as_str) == Some(name))
                .then(|| parts.get(1).cloned())
                .flatten()
        })
    };
    let start = tag("start")?;
    let time = match kind {
        31922 => {
            let start = NaiveDate::parse_from_str(&start, "%Y-%m-%d").ok()?;
            let end = match tag("end") {
                Some(value) => NaiveDate::parse_from_str(&value, "%Y-%m-%d").ok()?,
                None => start.succ_opt()?,
            };
            CalendarTime::AllDay { start, end }
        }
        31923 => {
            let start = DateTime::from_timestamp(start.parse().ok()?, 0)?;
            let end = match tag("end") {
                Some(value) => DateTime::from_timestamp(value.parse().ok()?, 0)?,
                None => start + chrono::Duration::minutes(30),
            };
            CalendarTime::Timed { start, end }
        }
        _ => return None,
    };
    Some(CalendarEvent {
        kind,
        author: event.pubkey.to_hex(),
        identifier: tag("d")?,
        title: tag("title")?,
        description: (!event.content.is_empty()).then(|| event.content.clone()),
        location: tag("location"),
        time,
        modified_at: DateTime::from_timestamp(event.created_at.as_secs() as i64, 0)?,
        url: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{to_bytes, Body},
        http::{Request, Response},
    };
    use buzz_auth::Nip98ReplayGuard;
    use nostr::{EventBuilder, Keys, Kind, Tag};
    use tower::ServiceExt;
    use uuid::Uuid;

    const TEST_DB_URL: &str = "postgres://buzz:buzz_dev@localhost:5432/buzz"; // sadscan:disable np.postgres.1

    struct AlwaysFreshReplayGuard;

    impl Nip98ReplayGuard for AlwaysFreshReplayGuard {
        fn try_mark_in_scope<'a>(
            &'a self,
            _scope: &'a str,
            _event_id: &'a nostr::EventId,
            _ttl_secs: u64,
        ) -> std::pin::Pin<
            Box<dyn std::future::Future<Output = Result<bool, buzz_auth::AuthError>> + Send + 'a>,
        > {
            Box::pin(async { Ok(true) })
        }
    }

    /// Build a real router state when the local integration database is available.
    ///
    /// These focused HTTP tests skip cleanly without Postgres, matching the relay's
    /// existing handler-test convention. Redis is not required: the replay guard is
    /// replaced and the pub/sub manager accepts a lazy pool.
    async fn http_test_state(host: &str) -> Option<Arc<AppState>> {
        let mut config = crate::config::Config::from_env().ok()?;
        let database_url = std::env::var("BUZZ_TEST_DATABASE_URL")
            .or_else(|_| std::env::var("DATABASE_URL"))
            .unwrap_or_else(|_| TEST_DB_URL.to_string());
        config.database_url = database_url.clone();
        config.redis_url = "redis://127.0.0.1:1".to_string();
        config.relay_url = format!("wss://{host}");
        config.require_auth_token = true;
        config.require_relay_membership = false;

        let pool = sqlx::PgPool::connect(&database_url).await.ok()?;
        let db = buzz_db::Db::from_pool(pool.clone());
        db.ensure_configured_community(host).await.ok()?;
        let redis_pool = deadpool_redis::Config::from_url(&config.redis_url)
            .create_pool(Some(deadpool_redis::Runtime::Tokio1))
            .ok()?;
        let pubsub = Arc::new(
            buzz_pubsub::PubSubManager::new(&config.redis_url, redis_pool.clone())
                .await
                .ok()?,
        );
        let audit = buzz_audit::AuditService::new(pool.clone());
        let auth = buzz_auth::AuthService::new(config.auth.clone());
        let search = buzz_search::SearchService::new(pool.clone());
        let workflow_engine = Arc::new(buzz_workflow::WorkflowEngine::new(
            db.clone(),
            buzz_workflow::WorkflowConfig::default(),
        ));
        let media_storage = buzz_media::MediaStorage::new(&config.media).ok()?;
        let (mut state, _audit_shutdown) = AppState::new(
            config,
            db,
            redis_pool,
            audit,
            pubsub,
            auth,
            search,
            workflow_engine,
            Keys::generate(),
            media_storage,
        );
        state.nip98_replay = Arc::new(AlwaysFreshReplayGuard);
        Some(Arc::new(state))
    }

    fn nip98_header(keys: &Keys, url: &str, method: &str) -> String {
        let event = EventBuilder::new(Kind::HttpAuth, "")
            .tags([
                Tag::parse(["u", url]).expect("u tag"),
                Tag::parse(["method", method]).expect("method tag"),
            ])
            .sign_with_keys(keys)
            .expect("sign NIP-98 event");
        let json = serde_json::to_vec(&event).expect("serialize NIP-98 event");
        format!(
            "Nostr {}",
            base64::engine::general_purpose::STANDARD.encode(json)
        )
    }

    async fn request(
        state: Arc<AppState>,
        host: &str,
        method: &str,
        path: &str,
        auth: Option<&str>,
        if_none_match: Option<&str>,
    ) -> Response<Body> {
        let mut builder = Request::builder()
            .method(method)
            .uri(path)
            .header(header::HOST, host);
        if let Some(auth) = auth {
            builder = builder.header(header::AUTHORIZATION, auth);
        }
        if let Some(etag) = if_none_match {
            builder = builder.header(header::IF_NONE_MATCH, etag);
        }
        crate::router::build_router(state)
            .oneshot(builder.body(Body::empty()).expect("request"))
            .await
            .expect("router response")
    }

    #[test]
    fn token_is_url_safe_and_hashes_raw_secret() {
        let (token, hash) = generate_token();
        assert_eq!(token.len(), 43);
        assert!(!token.contains(['+', '/', '=']));
        let raw = URL_SAFE_NO_PAD.decode(token).unwrap();
        assert_eq!(<[u8; 32]>::from(Sha256::digest(raw)), hash);
    }

    #[test]
    fn secret_urls_use_tenant_host_without_logging_or_query_scope() {
        let response = secret_response("community.example", "secret".into(), Utc::now());
        assert_eq!(
            response.https_url.as_deref(),
            Some("https://community.example/calendar/subscriptions/secret.ics")
        );
        assert_eq!(
            response.webcal_url.as_deref(),
            Some("webcal://community.example/calendar/subscriptions/secret.ics")
        );
    }

    fn stored_event(kind: u16, start: &str) -> buzz_core::StoredEvent {
        let event = EventBuilder::new(Kind::Custom(kind), "description")
            .tags([
                Tag::parse(["d", "coordinate"]).unwrap(),
                Tag::parse(["title", "Title"]).unwrap(),
                Tag::parse(["start", start]).unwrap(),
            ])
            .sign_with_keys(&Keys::generate())
            .unwrap();
        buzz_core::StoredEvent::new(event, None)
    }

    #[test]
    fn missing_date_end_defaults_to_next_day() {
        let mapped = map_stored_event(&stored_event(31922, "2026-08-25")).unwrap();
        assert_eq!(
            mapped.time,
            CalendarTime::AllDay {
                start: NaiveDate::from_ymd_opt(2026, 8, 25).unwrap(),
                end: NaiveDate::from_ymd_opt(2026, 8, 26).unwrap(),
            }
        );
    }

    #[test]
    fn missing_timed_end_matches_desktop_half_hour_projection() {
        let mapped = map_stored_event(&stored_event(31923, "1787623200")).unwrap();
        let CalendarTime::Timed { start, end } = mapped.time else {
            panic!("expected timed event");
        };
        assert_eq!(end - start, chrono::Duration::minutes(30));
    }

    #[tokio::test]
    async fn router_matches_ics_feed_and_invalid_tokens_share_plain_404() {
        let host = format!("calendar-http-{}.example", Uuid::new_v4().simple());
        let Some(state) = http_test_state(&host).await else {
            return;
        };

        for path in [
            "/calendar/subscriptions/not-an-ics-name",
            "/calendar/subscriptions/not-base64.ics",
            "/calendar/subscriptions/c2hvcnQ.ics",
        ] {
            let response = request(state.clone(), &host, "GET", path, None, None).await;
            assert_eq!(response.status(), StatusCode::NOT_FOUND, "path: {path}");
            assert!(response.headers().get(header::CONTENT_TYPE).is_none());
            assert!(
                to_bytes(response.into_body(), 1024)
                    .await
                    .expect("404 body")
                    .is_empty(),
                "invalid bearer tokens must not reveal why resolution failed"
            );
        }
    }

    #[tokio::test]
    async fn management_routes_bind_nip98_to_the_exact_method_and_path() {
        let host = format!("calendar-auth-{}.example", Uuid::new_v4().simple());
        let Some(state) = http_test_state(&host).await else {
            return;
        };
        let keys = Keys::generate();

        let wrong_method = nip98_header(&keys, &format!("https://{host}{STATUS_PATH}"), "POST");
        let response = request(
            state.clone(),
            &host,
            "GET",
            STATUS_PATH,
            Some(&wrong_method),
            None,
        )
        .await;
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

        let wrong_path = nip98_header(&keys, &format!("https://{host}{REGENERATE_PATH}"), "POST");
        let response = request(state, &host, "POST", STATUS_PATH, Some(&wrong_path), None).await;
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn feed_sets_calendar_headers_and_honors_if_none_match() {
        let host = format!("calendar-feed-{}.example", Uuid::new_v4().simple());
        let Some(state) = http_test_state(&host).await else {
            return;
        };
        let tenant = crate::tenant::bind_community(&state.db, &host)
            .await
            .expect("test community");
        let raw = [0x5a; 32];
        let token = URL_SAFE_NO_PAD.encode(raw);
        let hash: [u8; 32] = Sha256::digest(raw).into();
        let owner = Keys::generate().public_key();
        state
            .db
            .ensure_user(tenant.community(), owner.as_bytes())
            .await
            .expect("create subscription owner");
        state
            .db
            .create_calendar_subscription(tenant.community(), owner.as_bytes(), &hash)
            .await
            .expect("create subscription");
        let path = format!("/calendar/subscriptions/{token}.ics");

        let response = request(state.clone(), &host, "GET", &path, None, None).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "text/calendar; charset=utf-8"
        );
        assert_eq!(
            response.headers().get(header::CONTENT_DISPOSITION).unwrap(),
            "inline; filename=\"buzz-calendar.ics\""
        );
        assert_eq!(
            response.headers().get(header::CACHE_CONTROL).unwrap(),
            "private, no-cache"
        );
        let etag = response
            .headers()
            .get(header::ETAG)
            .expect("etag")
            .to_str()
            .expect("etag text")
            .to_owned();
        let body = to_bytes(response.into_body(), 1024 * 1024)
            .await
            .expect("calendar body");
        assert!(body.starts_with(b"BEGIN:VCALENDAR\r\n"));

        let response = request(state, &host, "GET", &path, None, Some(&etag)).await;
        assert_eq!(response.status(), StatusCode::NOT_MODIFIED);
        assert_eq!(
            response
                .headers()
                .get(header::ETAG)
                .unwrap()
                .to_str()
                .unwrap(),
            etag
        );
        assert_eq!(
            response.headers().get(header::CACHE_CONTROL).unwrap(),
            "private, no-cache"
        );
        assert!(response.headers().get(header::CONTENT_TYPE).is_none());
        assert!(to_bytes(response.into_body(), 1024)
            .await
            .expect("304 body")
            .is_empty());
    }
}
