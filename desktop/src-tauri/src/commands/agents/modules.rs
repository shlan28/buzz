// Remote agent shutdown is handled entirely by the frontend: the frontend
// sends a signed `!shutdown` mention, the harness exits and publishes offline
// presence, and the existing presence polling updates the UI.
#[path = "../agents_deploy.rs"]
mod deploy;
pub(super) mod provider_access;
use deploy::build_deploy_payload;
#[cfg(test)]
use deploy::{deploy_payload_json, DeployProjections};
#[cfg(test)]
use deploy::{ensure_remote_provider_supported, resolve_deploy_model_provider};

#[path = "../agents_profile.rs"]
mod profile;
#[cfg(test)]
use profile::{profile_needs_sync, resolve_legacy_avatar};
pub(crate) use profile::{reconcile_agent_profile, ProfileReconcileData};

#[cfg(test)]
#[path = "../agents_tests.rs"]
mod tests;
