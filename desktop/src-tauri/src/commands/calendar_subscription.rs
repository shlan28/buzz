use reqwest::Method;
use serde_json::Value;
use tauri::State;

use crate::{
    app_state::AppState,
    relay::{
        build_nip98_auth_header, parse_json_response, relay_api_base_url_with_override,
        relay_error_message,
    },
};

const SUBSCRIPTION_PATH: &str = "/api/calendar/subscription";

fn resolve_request(method: &str, suffix: &str) -> Result<(Method, &'static str), String> {
    match (method, suffix) {
        ("GET", "") => Ok((Method::GET, SUBSCRIPTION_PATH)),
        ("POST", "") => Ok((Method::POST, SUBSCRIPTION_PATH)),
        ("POST", "/regenerate") => Ok((Method::POST, "/api/calendar/subscription/regenerate")),
        ("DELETE", "") => Ok((Method::DELETE, SUBSCRIPTION_PATH)),
        _ => Err("unsupported Calendar subscription request".to_string()),
    }
}

/// Perform a fixed-scope Calendar subscription management request natively.
///
/// The command deliberately accepts only the four product operations rather
/// than acting as an arbitrary authenticated HTTP proxy.
#[tauri::command]
pub async fn calendar_subscription_request(
    method: String,
    suffix: Option<String>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let suffix = suffix.unwrap_or_default();
    let (method, path) = resolve_request(&method, &suffix)?;
    let url = format!(
        "{}{}",
        relay_api_base_url_with_override(&state).trim_end_matches('/'),
        path
    );
    let authorization = build_nip98_auth_header(&method, &url, &[], &state)?;
    let response = state
        .http_client
        .request(method, &url)
        .header(reqwest::header::AUTHORIZATION, authorization)
        .send()
        .await
        .map_err(|error| crate::relay::classify_request_error(&error))?;

    if !response.status().is_success() {
        return Err(relay_error_message(response).await);
    }
    parse_json_response(response).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_scope_is_closed_over_product_operations() {
        assert_eq!(resolve_request("GET", "").unwrap().1, SUBSCRIPTION_PATH);
        assert_eq!(
            resolve_request("POST", "/regenerate").unwrap().1,
            "/api/calendar/subscription/regenerate"
        );
        assert!(resolve_request("GET", "/regenerate").is_err());
        assert!(resolve_request("POST", "/other").is_err());
        assert!(resolve_request("PATCH", "").is_err());
    }
}
