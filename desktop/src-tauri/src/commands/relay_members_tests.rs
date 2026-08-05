use super::relay_members::managed_agent_membership_add_needed;

const TARGET: &str = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

#[test]
fn open_relay_never_adds_managed_agent_membership() {
    assert!(!managed_agent_membership_add_needed(
        false,
        &serde_json::json!({ "members": [] }),
        TARGET,
    ));
}

#[test]
fn restricted_relay_adds_missing_managed_agent_as_member() {
    assert!(managed_agent_membership_add_needed(
        true,
        &serde_json::json!({ "members": [] }),
        TARGET,
    ));
}

#[test]
fn existing_membership_is_preserved_case_insensitively() {
    assert!(!managed_agent_membership_add_needed(
        true,
        &serde_json::json!({
            "members": [{
                "pubkey": TARGET.to_ascii_uppercase(),
                "role": "admin"
            }]
        }),
        TARGET,
    ));
}

#[test]
fn malformed_snapshot_fails_closed_to_membership_add() {
    assert!(managed_agent_membership_add_needed(
        true,
        &serde_json::json!({ "members": "invalid" }),
        TARGET,
    ));
}
