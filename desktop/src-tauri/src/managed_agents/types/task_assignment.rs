use serde::{Deserialize, Serialize};

/// Relay-enforced policy controlling who may assign new tasks to an Agent.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskAssignmentPolicy {
    #[default]
    OwnerOnly,
    Allowlist,
    Anyone,
}

impl TaskAssignmentPolicy {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::OwnerOnly => "owner_only",
            Self::Allowlist => "allowlist",
            Self::Anyone => "anyone",
        }
    }
}
