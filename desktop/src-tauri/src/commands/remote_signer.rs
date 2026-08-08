use std::sync::Mutex;

use futures_util::{SinkExt, StreamExt};
use nostr::{nips::nip44, Event, EventBuilder, JsonUtil, Keys, Kind, PublicKey, Tag, Timestamp};
use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tokio_util::sync::CancellationToken;
use zeroize::Zeroizing;

const KIND_NOSTR_CONNECT: u16 = 24_133;
const ALLOWED_SIGN_KINDS: &[u16] = &[22_242, 27_235];
const SIGNER_READY_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);
const SIGNER_RECONNECT_MIN_DELAY: std::time::Duration = std::time::Duration::from_millis(250);
const SIGNER_RECONNECT_MAX_DELAY: std::time::Duration = std::time::Duration::from_secs(5);

struct SignerTask {
    cancel: CancellationToken,
}

/// Runtime-only authorization for the Web device paired with this Desktop.
/// The user's private key never leaves Desktop and the one-time secret is not persisted.
pub struct RemoteSignerHandle {
    task: Mutex<Option<SignerTask>>,
}

impl RemoteSignerHandle {
    pub fn new() -> Self {
        Self {
            task: Mutex::new(None),
        }
    }

    pub async fn authorize(
        &self,
        keys: Keys,
        relay_url: String,
        client_pubkey: PublicKey,
        secret: Zeroizing<String>,
    ) -> Result<(), String> {
        let cancel = CancellationToken::new();
        {
            let mut task = self.task.lock().map_err(|error| error.to_string())?;
            if let Some(previous) = task.take() {
                previous.cancel.cancel();
            }
            *task = Some(SignerTask {
                cancel: cancel.clone(),
            });
        }
        let (ready_tx, ready_rx) = oneshot::channel();
        tauri::async_runtime::spawn(remote_signer_task(
            keys,
            relay_url,
            client_pubkey,
            secret,
            cancel.clone(),
            ready_tx,
        ));
        if let Err(error) = await_signer_ready(ready_rx, SIGNER_READY_TIMEOUT).await {
            cancel.cancel();
            return Err(error);
        }
        Ok(())
    }

    fn revoke(&self) -> Result<(), String> {
        if let Some(task) = self.task.lock().map_err(|error| error.to_string())?.take() {
            task.cancel.cancel();
        }
        Ok(())
    }
}

#[tauri::command]
pub fn revoke_web_signer(
    remote_signer: tauri::State<'_, RemoteSignerHandle>,
) -> Result<(), String> {
    remote_signer.revoke()
}

#[derive(Deserialize)]
struct RpcRequest {
    id: String,
    method: String,
    #[serde(default)]
    params: Vec<String>,
}

#[derive(Serialize)]
struct RpcResponse {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Deserialize)]
struct UnsignedEventRequest {
    kind: u16,
    content: String,
    tags: Vec<Vec<String>>,
    created_at: u64,
}

async fn remote_signer_task(
    keys: Keys,
    relay_url: String,
    client_pubkey: PublicKey,
    secret: Zeroizing<String>,
    cancel: CancellationToken,
    ready_tx: oneshot::Sender<()>,
) {
    let mut connected = false;
    let mut ready_tx = Some(ready_tx);
    let mut reconnect_delay = SIGNER_RECONNECT_MIN_DELAY;
    loop {
        let result = remote_signer_connection(
            &keys,
            &relay_url,
            client_pubkey,
            secret.as_str(),
            &cancel,
            &mut connected,
            &mut ready_tx,
        )
        .await;
        if cancel.is_cancelled() {
            break;
        }
        if let Err(error) = result {
            tracing::warn!(%error, ?reconnect_delay, "remote signer connection lost; reconnecting");
        }
        tokio::select! {
            _ = cancel.cancelled() => break,
            _ = tokio::time::sleep(reconnect_delay) => {}
        }
        reconnect_delay = next_reconnect_delay(reconnect_delay);
    }
}

async fn remote_signer_connection(
    keys: &Keys,
    relay_url: &str,
    client_pubkey: PublicKey,
    secret: &str,
    cancel: &CancellationToken,
    connected: &mut bool,
    ready_tx: &mut Option<oneshot::Sender<()>>,
) -> Result<(), String> {
    let (socket, _) = connect_async(relay_url)
        .await
        .map_err(|error| format!("remote signer connection failed: {error}"))?;
    let (mut write, mut read) = socket.split();
    let signer_pubkey = keys.public_key();
    let subscription = serde_json::json!([
        "REQ",
        "remote-signer",
        {"kinds": [KIND_NOSTR_CONNECT], "#p": [signer_pubkey.to_hex()]}
    ]);
    write
        .send(Message::Text(subscription.to_string().into()))
        .await
        .map_err(|error| format!("remote signer subscribe failed: {error}"))?;

    wait_for_signer_eose(&mut read, cancel).await?;
    if let Some(sender) = ready_tx.take() {
        sender
            .send(())
            .map_err(|_| "remote signer ready receiver closed".to_string())?;
    }

    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            message = read.next() => {
                let Some(message) = message else {
                    return Err("remote signer relay closed connection".into());
                };
                let message = message.map_err(|error| format!("remote signer read failed: {error}"))?;
                let Message::Text(text) = message else { continue };
                let Some(event) = parse_relay_event(text.as_str()) else { continue };
                if event.pubkey != client_pubkey || event.verify().is_err() || !event.tags.iter().any(|tag| {
                    let values = tag.as_slice();
                    values.first().map(String::as_str) == Some("p")
                        && values.get(1).map(String::as_str) == Some(signer_pubkey.to_hex().as_str())
                }) {
                    continue;
                }

                let plaintext = nip44::decrypt(keys.secret_key(), &client_pubkey, &event.content)
                    .map_err(|error| format!("remote signer decrypt failed: {error}"))?;
                let request: RpcRequest = serde_json::from_str(&plaintext)
                    .map_err(|error| format!("invalid remote signer request: {error}"))?;
                let response = handle_request(keys, secret, connected, request);
                let response_json = serde_json::to_string(&response)
                    .map_err(|error| format!("serialize remote signer response: {error}"))?;
                let encrypted = nip44::encrypt(
                    keys.secret_key(),
                    &client_pubkey,
                    response_json,
                    nip44::Version::V2,
                )
                .map_err(|error| format!("remote signer encrypt failed: {error}"))?;
                let event = EventBuilder::new(Kind::Custom(KIND_NOSTR_CONNECT), encrypted)
                    .tag(Tag::public_key(client_pubkey))
                    .sign_with_keys(keys)
                    .map_err(|error| format!("sign remote signer response: {error}"))?;
                let frame = serde_json::json!(["EVENT", event]);
                write.send(Message::Text(frame.to_string().into())).await
                    .map_err(|error| format!("publish remote signer response failed: {error}"))?;
            }
        }
    }
    Ok(())
}

fn next_reconnect_delay(current: std::time::Duration) -> std::time::Duration {
    current
        .checked_mul(2)
        .unwrap_or(SIGNER_RECONNECT_MAX_DELAY)
        .min(SIGNER_RECONNECT_MAX_DELAY)
}

async fn wait_for_signer_eose<R>(read: &mut R, cancel: &CancellationToken) -> Result<(), String>
where
    R: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    loop {
        tokio::select! {
            _ = cancel.cancelled() => return Err("remote signer cancelled before ready".into()),
            message = read.next() => {
                let Some(message) = message else {
                    return Err("remote signer relay closed before ready".into());
                };
                let message = message
                    .map_err(|error| format!("remote signer read before ready failed: {error}"))?;
                if let Message::Text(text) = message {
                    if is_signer_eose(text.as_str()) {
                        return Ok(());
                    }
                }
            }
        }
    }
}

fn is_signer_eose(text: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(text)
        .ok()
        .and_then(|value| value.as_array().cloned())
        .is_some_and(|frame| {
            frame.first().and_then(serde_json::Value::as_str) == Some("EOSE")
                && frame.get(1).and_then(serde_json::Value::as_str) == Some("remote-signer")
        })
}

async fn await_signer_ready(
    ready_rx: oneshot::Receiver<()>,
    timeout: std::time::Duration,
) -> Result<(), String> {
    match tokio::time::timeout(timeout, ready_rx).await {
        Ok(Ok(())) => Ok(()),
        Ok(Err(_)) => Err("remote signer stopped before its subscription was ready".into()),
        Err(_) => Err("remote signer subscription timed out".into()),
    }
}

fn parse_relay_event(text: &str) -> Option<Event> {
    let frame: serde_json::Value = serde_json::from_str(text).ok()?;
    let values = frame.as_array()?;
    if values.first()?.as_str()? != "EVENT" || values.get(1)?.as_str()? != "remote-signer" {
        return None;
    }
    Event::from_json(values.get(2)?.to_string()).ok()
}

fn handle_request(
    keys: &Keys,
    secret: &str,
    connected: &mut bool,
    request: RpcRequest,
) -> RpcResponse {
    let outcome = match request.method.as_str() {
        "connect" => handle_connect(keys, secret, connected, &request.params),
        "ping" if *connected => Ok("pong".into()),
        "get_public_key" if *connected => Ok(keys.public_key().to_hex()),
        "sign_event" if *connected => sign_event(keys, request.params.first()),
        _ if !*connected => Err("client is not connected".into()),
        _ => Err("unsupported method".into()),
    };
    match outcome {
        Ok(result) => RpcResponse {
            id: request.id,
            result: Some(result),
            error: None,
        },
        Err(error) => RpcResponse {
            id: request.id,
            result: None,
            error: Some(error),
        },
    }
}

fn handle_connect(
    keys: &Keys,
    secret: &str,
    connected: &mut bool,
    params: &[String],
) -> Result<String, String> {
    if *connected {
        return Err("connection secret was already used".into());
    }
    if params.first().map(String::as_str) != Some(keys.public_key().to_hex().as_str())
        || params.get(1).map(String::as_str) != Some(secret)
    {
        return Err("invalid connection secret".into());
    }
    *connected = true;
    Ok("ack".into())
}

fn sign_event(keys: &Keys, event_json: Option<&String>) -> Result<String, String> {
    let unsigned: UnsignedEventRequest =
        serde_json::from_str(event_json.ok_or_else(|| "missing unsigned event".to_string())?)
            .map_err(|error| format!("invalid unsigned event: {error}"))?;
    if !ALLOWED_SIGN_KINDS.contains(&unsigned.kind) {
        return Err(format!("event kind {} is not permitted", unsigned.kind));
    }
    let tags = unsigned
        .tags
        .into_iter()
        .map(|tag| Tag::parse(tag).map_err(|error| format!("invalid tag: {error}")))
        .collect::<Result<Vec<_>, _>>()?;
    EventBuilder::new(Kind::Custom(unsigned.kind), unsigned.content)
        .tags(tags)
        .custom_created_at(Timestamp::from(unsigned.created_at))
        .sign_with_keys(keys)
        .map(|event| event.as_json())
        .map_err(|error| format!("sign event failed: {error}"))
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::{
        await_signer_ready, handle_request, is_signer_eose, next_reconnect_delay, RpcRequest,
        SIGNER_RECONNECT_MAX_DELAY, SIGNER_RECONNECT_MIN_DELAY,
    };
    use nostr::Keys;
    use tokio::sync::oneshot;

    #[test]
    fn only_accepts_eose_for_the_signer_subscription() {
        assert!(is_signer_eose(r#"["EOSE","remote-signer"]"#));
        assert!(!is_signer_eose(r#"["EOSE","other"]"#));
        assert!(!is_signer_eose(r#"["NOTICE","remote-signer"]"#));
    }

    #[tokio::test]
    async fn ready_wait_reports_success_and_timeout() {
        let (ready_tx, ready_rx) = oneshot::channel();
        ready_tx.send(()).expect("ready receiver remains open");
        assert!(await_signer_ready(ready_rx, Duration::from_secs(1))
            .await
            .is_ok());

        let (_pending_tx, pending_rx) = oneshot::channel();
        let error = await_signer_ready(pending_rx, Duration::from_millis(1))
            .await
            .expect_err("pending signer must time out");
        assert_eq!(error, "remote signer subscription timed out");
    }

    #[test]
    fn connect_requires_matching_one_time_secret() {
        let keys = Keys::generate();
        let mut connected = false;
        let response = handle_request(
            &keys,
            "expected",
            &mut connected,
            RpcRequest {
                id: "1".into(),
                method: "connect".into(),
                params: vec![keys.public_key().to_hex(), "wrong".into()],
            },
        );
        assert!(!connected);
        assert_eq!(response.error.as_deref(), Some("invalid connection secret"));
    }

    #[test]
    fn signer_rejects_unapproved_event_kinds() {
        let keys = Keys::generate();
        let mut connected = true;
        let response = handle_request(
            &keys,
            "secret",
            &mut connected,
            RpcRequest {
                id: "2".into(),
                method: "sign_event".into(),
                params: vec![r#"{"kind":1,"content":"no","tags":[],"created_at":1}"#.into()],
            },
        );
        assert_eq!(
            response.error.as_deref(),
            Some("event kind 1 is not permitted")
        );
    }

    #[test]
    fn reconnect_backoff_is_bounded() {
        let mut delay = SIGNER_RECONNECT_MIN_DELAY;
        for _ in 0..10 {
            delay = next_reconnect_delay(delay);
        }
        assert_eq!(delay, SIGNER_RECONNECT_MAX_DELAY);
        assert_eq!(next_reconnect_delay(delay), SIGNER_RECONNECT_MAX_DELAY);
    }

    #[test]
    fn authorized_client_remains_connected_across_transport_reconnects() {
        let keys = Keys::generate();
        let mut connected = true;
        let response = handle_request(
            &keys,
            "already-consumed",
            &mut connected,
            RpcRequest {
                id: "3".into(),
                method: "get_public_key".into(),
                params: vec![],
            },
        );
        assert_eq!(
            response.result.as_deref(),
            Some(keys.public_key().to_hex().as_str())
        );
        assert!(response.error.is_none());
        assert!(connected);
    }
}
