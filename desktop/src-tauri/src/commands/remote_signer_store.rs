//! Persists the single Web Remote Signer authorization in the system keychain.
//!
//! Pairing owns creation of the authorization, while the Remote Signer owns
//! its runtime lifecycle. Keeping persistence here prevents either workflow
//! from inventing a second source of truth.

use nostr::PublicKey;
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

use crate::secret_store::SecretStore;

const AUTHORIZATION_KEY: &str = "web_remote_signer_authorization_v1";
const AUTHORIZATION_VERSION: u8 = 1;

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
struct StoredRemoteSignerAuthorization {
    version: u8,
    owner_pubkey: String,
    client_pubkey: String,
    relay_url: String,
    signer_secret: String,
    created_at: u64,
}

/// Validated authorization ready to start a signer task.
pub struct RemoteSignerAuthorization {
    owner_pubkey: PublicKey,
    pub client_pubkey: PublicKey,
    pub relay_url: String,
    pub signer_secret: Zeroizing<String>,
}

/// Previous keychain value retained only long enough to roll back a failed
/// replacement. The inner JSON must never be logged.
pub struct AuthorizationBackup(Option<Zeroizing<String>>);

trait AuthorizationStore {
    fn load_value(&self, key: &str) -> Result<Option<String>, String>;
    fn store_value(&self, key: &str, value: &str) -> Result<(), String>;
    fn verify_value(&self, key: &str, value: &str) -> Result<bool, String>;
    fn delete_value(&self, key: &str) -> Result<(), String>;
}

impl AuthorizationStore for SecretStore {
    fn load_value(&self, key: &str) -> Result<Option<String>, String> {
        self.load(key)
    }

    fn store_value(&self, key: &str, value: &str) -> Result<(), String> {
        self.store(key, value)
    }

    fn verify_value(&self, key: &str, value: &str) -> Result<bool, String> {
        self.verify_stored_raw(key, value)
    }

    fn delete_value(&self, key: &str) -> Result<(), String> {
        self.delete(key)
    }
}

fn keychain() -> &'static SecretStore {
    SecretStore::shared(crate::app_state::keyring_service())
}

/// Save a complete authorization and verify the OS keychain round trip before
/// the pairing flow reports success to Web.
pub fn save(
    owner_pubkey: PublicKey,
    client_pubkey: PublicKey,
    relay_url: String,
    signer_secret: &str,
) -> Result<AuthorizationBackup, String> {
    let created_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| format!("system clock before Unix epoch: {error}"))?
        .as_secs();
    let store = keychain();
    let previous = store
        .load_value(AUTHORIZATION_KEY)
        .map_err(|error| format!("load previous Web signer authorization: {error}"))?
        .map(Zeroizing::new);
    save_to(
        store,
        StoredRemoteSignerAuthorization {
            version: AUTHORIZATION_VERSION,
            owner_pubkey: owner_pubkey.to_hex(),
            client_pubkey: client_pubkey.to_hex(),
            relay_url,
            signer_secret: signer_secret.to_string(),
            created_at,
        },
    )?;
    Ok(AuthorizationBackup(previous))
}

/// Load and validate the authorization for the active Desktop identity.
pub fn load(expected_owner: PublicKey) -> Result<Option<RemoteSignerAuthorization>, String> {
    load_from(keychain(), expected_owner)
}

/// Remove the durable authorization. A missing record is already revoked.
pub fn delete() -> Result<(), String> {
    keychain().delete_value(AUTHORIZATION_KEY)
}

/// Restore the exact value that existed before an attempted replacement.
pub fn rollback(backup: AuthorizationBackup) -> Result<(), String> {
    rollback_to(keychain(), backup)
}

fn rollback_to(store: &impl AuthorizationStore, backup: AuthorizationBackup) -> Result<(), String> {
    match backup.0 {
        Some(previous) => {
            store.store_value(AUTHORIZATION_KEY, previous.as_str())?;
            if !store.verify_value(AUTHORIZATION_KEY, previous.as_str())? {
                return Err(
                    "previous Web signer authorization failed keychain verification".into(),
                );
            }
            Ok(())
        }
        None => store.delete_value(AUTHORIZATION_KEY),
    }
}

fn save_to(
    store: &impl AuthorizationStore,
    record: StoredRemoteSignerAuthorization,
) -> Result<(), String> {
    validate_record(&record)?;
    let serialized = serde_json::to_string(&record)
        .map_err(|error| format!("serialize Web signer authorization: {error}"))?;
    store
        .store_value(AUTHORIZATION_KEY, &serialized)
        .map_err(|error| format!("store Web signer authorization: {error}"))?;
    if !store
        .verify_value(AUTHORIZATION_KEY, &serialized)
        .map_err(|error| format!("verify Web signer authorization: {error}"))?
    {
        return Err("Web signer authorization failed keychain verification".into());
    }
    Ok(())
}

fn load_from(
    store: &impl AuthorizationStore,
    expected_owner: PublicKey,
) -> Result<Option<RemoteSignerAuthorization>, String> {
    let Some(serialized) = store
        .load_value(AUTHORIZATION_KEY)
        .map_err(|error| format!("load Web signer authorization: {error}"))?
    else {
        return Ok(None);
    };
    let record: StoredRemoteSignerAuthorization = serde_json::from_str(&serialized)
        .map_err(|error| format!("parse Web signer authorization: {error}"))?;
    let authorization = validate_record(&record)?;
    if authorization.owner_pubkey != expected_owner {
        return Err("Web signer authorization belongs to a different Desktop identity".into());
    }
    Ok(Some(authorization))
}

fn validate_record(
    record: &StoredRemoteSignerAuthorization,
) -> Result<RemoteSignerAuthorization, String> {
    if record.version != AUTHORIZATION_VERSION {
        return Err(format!(
            "unsupported Web signer authorization version {}",
            record.version
        ));
    }
    let owner_pubkey = PublicKey::parse(&record.owner_pubkey)
        .map_err(|error| format!("invalid Web signer owner pubkey: {error}"))?;
    let client_pubkey = PublicKey::parse(&record.client_pubkey)
        .map_err(|error| format!("invalid Web signer client pubkey: {error}"))?;
    let relay_url = url::Url::parse(&record.relay_url)
        .map_err(|error| format!("invalid Web signer Relay URL: {error}"))?;
    if relay_url.scheme() != "wss" || relay_url.host_str().is_none() {
        return Err("Web signer Relay URL must use wss:// with a host".into());
    }
    if record.signer_secret.len() != 64
        || !record
            .signer_secret
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err("Web signer secret must be 64 hexadecimal characters".into());
    }
    Ok(RemoteSignerAuthorization {
        owner_pubkey,
        client_pubkey,
        relay_url: relay_url.to_string(),
        signer_secret: Zeroizing::new(record.signer_secret.clone()),
    })
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::Mutex;

    use nostr::Keys;

    use super::*;

    #[derive(Default)]
    struct FakeStore {
        values: Mutex<HashMap<String, String>>,
        fail_verify: bool,
    }

    impl AuthorizationStore for FakeStore {
        fn load_value(&self, key: &str) -> Result<Option<String>, String> {
            Ok(self
                .values
                .lock()
                .map_err(|error| error.to_string())?
                .get(key)
                .cloned())
        }

        fn store_value(&self, key: &str, value: &str) -> Result<(), String> {
            self.values
                .lock()
                .map_err(|error| error.to_string())?
                .insert(key.to_string(), value.to_string());
            Ok(())
        }

        fn verify_value(&self, key: &str, value: &str) -> Result<bool, String> {
            if self.fail_verify {
                return Ok(false);
            }
            Ok(self.load_value(key)?.as_deref() == Some(value))
        }

        fn delete_value(&self, key: &str) -> Result<(), String> {
            self.values
                .lock()
                .map_err(|error| error.to_string())?
                .remove(key);
            Ok(())
        }
    }

    fn record(owner: &Keys, client: &Keys) -> StoredRemoteSignerAuthorization {
        StoredRemoteSignerAuthorization {
            version: AUTHORIZATION_VERSION,
            owner_pubkey: owner.public_key().to_hex(),
            client_pubkey: client.public_key().to_hex(),
            relay_url: "wss://achoverse.xyz/signer".into(),
            signer_secret: "ab".repeat(32),
            created_at: 1,
        }
    }

    #[test]
    fn saves_and_loads_a_validated_authorization() {
        let store = FakeStore::default();
        let owner = Keys::generate();
        let client = Keys::generate();
        save_to(&store, record(&owner, &client)).expect("authorization saves");

        let loaded = load_from(&store, owner.public_key())
            .expect("authorization loads")
            .expect("authorization exists");
        assert_eq!(loaded.client_pubkey, client.public_key());
        assert_eq!(loaded.signer_secret.as_str(), "ab".repeat(32));
    }

    #[test]
    fn rejects_identity_mismatch_and_invalid_relay() {
        let store = FakeStore::default();
        let owner = Keys::generate();
        let client = Keys::generate();
        save_to(&store, record(&owner, &client)).expect("authorization saves");
        let mismatch = match load_from(&store, Keys::generate().public_key()) {
            Ok(_) => panic!("different owner must fail closed"),
            Err(error) => error,
        };
        assert!(mismatch.contains("different Desktop identity"));

        let mut invalid = record(&owner, &client);
        invalid.relay_url = "ws://localhost:5001".into();
        assert!(save_to(&store, invalid).is_err());
    }

    #[test]
    fn failed_readback_does_not_report_success() {
        let store = FakeStore {
            fail_verify: true,
            ..FakeStore::default()
        };
        let error = save_to(&store, record(&Keys::generate(), &Keys::generate()))
            .expect_err("readback mismatch must fail");
        assert!(error.contains("failed keychain verification"));
    }

    #[test]
    fn rollback_restores_the_previous_authorization() {
        let store = FakeStore::default();
        store
            .store_value(AUTHORIZATION_KEY, "previous")
            .expect("previous value stores");
        store
            .store_value(AUTHORIZATION_KEY, "replacement")
            .expect("replacement stores");

        rollback_to(
            &store,
            AuthorizationBackup(Some(Zeroizing::new("previous".into()))),
        )
        .expect("rollback succeeds");
        assert_eq!(
            store
                .load_value(AUTHORIZATION_KEY)
                .expect("value loads")
                .as_deref(),
            Some("previous")
        );
    }
}
