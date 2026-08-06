use tauri::State;

use crate::{app_state::AppState, models::ChannelPageCursor, relay::query_relay};

const TIMELINE_KINDS: [u32; 11] = [
    9,
    40002,
    40008,
    40099,
    43001,
    43002,
    43003,
    43004,
    43005,
    43006,
    buzz_core_pkg::kind::KIND_HUDDLE_STARTED,
];

fn build_channel_window_filter(
    channel_id: &str,
    cap: u32,
    cursor: Option<&ChannelPageCursor>,
) -> serde_json::Value {
    let mut filter = serde_json::Map::new();
    filter.insert("#h".to_string(), serde_json::json!([channel_id]));
    filter.insert("kinds".to_string(), serde_json::json!(TIMELINE_KINDS));
    filter.insert("limit".to_string(), serde_json::json!(cap));
    filter.insert("top_level".to_string(), serde_json::json!(true));
    filter.insert("include_summaries".to_string(), serde_json::json!(true));
    filter.insert("include_aux".to_string(), serde_json::json!(true));
    if let Some(cursor) = cursor {
        filter.insert("until".to_string(), serde_json::json!(cursor.created_at));
        filter.insert("before_id".to_string(), serde_json::json!(cursor.event_id));
    }
    serde_json::Value::Object(filter)
}

/// Fetch one server-assembled channel window over the existing `/query` bridge.
#[tauri::command]
pub async fn get_channel_window(
    channel_id: String,
    limit_rows: Option<u32>,
    cursor: Option<ChannelPageCursor>,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let filter = build_channel_window_filter(
        &channel_id,
        limit_rows.unwrap_or(50).min(200),
        cursor.as_ref(),
    );
    Ok(query_relay(&state, &[filter])
        .await?
        .iter()
        .filter_map(|event| serde_json::to_value(event).ok())
        .collect())
}

fn build_channel_history_range_filter(
    channel_id: &str,
    since: i64,
    until: i64,
    cap: u32,
) -> serde_json::Value {
    serde_json::json!({
        "#h": [channel_id],
        "kinds": TIMELINE_KINDS,
        "since": since,
        "until": until,
        "limit": cap,
    })
}

/// Fetch a bounded read-only history slice for the Agent DM history dialog.
///
/// This intentionally does not use the live channel-window store: the dialog
/// owns an isolated React Query cache and must not disturb the active DM.
#[tauri::command]
pub async fn get_channel_history_range(
    channel_id: String,
    since: i64,
    until: i64,
    limit: Option<u32>,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    if since > until {
        return Err("history range start must not be after end".to_string());
    }
    let filter = build_channel_history_range_filter(
        &channel_id,
        since,
        until,
        limit.unwrap_or(500).clamp(1, 500),
    );
    Ok(query_relay(&state, &[filter])
        .await?
        .iter()
        .filter_map(|event| serde_json::to_value(event).ok())
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn history_range_filter_is_channel_and_time_scoped() {
        let filter = build_channel_history_range_filter("channel", 10, 20, 50);
        assert_eq!(filter["#h"], serde_json::json!(["channel"]));
        assert_eq!(filter["since"], 10);
        assert_eq!(filter["until"], 20);
        assert_eq!(filter["limit"], 50);
        assert!(filter["kinds"]
            .as_array()
            .is_some_and(|kinds| !kinds.is_empty()));
    }
}
