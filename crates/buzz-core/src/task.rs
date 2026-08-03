//! Domain types and validation for Buzz Tasks events.

use nostr::Event;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Maximum UTF-8 byte length of a task title.
pub const TASK_TITLE_MAX_BYTES: usize = 256;
/// Maximum UTF-8 byte length of a task description.
pub const TASK_DESCRIPTION_MAX_BYTES: usize = 65_536;

/// Task workflow state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TaskStatus {
    /// Not yet scheduled.
    Backlog,
    /// Ready to start.
    Todo,
    /// Actively being worked.
    InProgress,
    /// Unable to proceed.
    Blocked,
    /// Finished.
    Done,
}

impl TaskStatus {
    /// Wire value used by the `task-status:` tag.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Backlog => "backlog",
            Self::Todo => "todo",
            Self::InProgress => "in-progress",
            Self::Blocked => "blocked",
            Self::Done => "done",
        }
    }
}

impl std::str::FromStr for TaskStatus {
    type Err = TaskError;
    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "backlog" => Ok(Self::Backlog),
            "todo" => Ok(Self::Todo),
            "in-progress" => Ok(Self::InProgress),
            "blocked" => Ok(Self::Blocked),
            "done" => Ok(Self::Done),
            _ => Err(TaskError::InvalidStatus),
        }
    }
}

/// Task priority.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TaskPriority {
    /// No explicit priority.
    None,
    /// Low priority.
    Low,
    /// Medium priority.
    Medium,
    /// High priority.
    High,
    /// Urgent priority.
    Urgent,
}

impl TaskPriority {
    /// Wire value used by the `task-priority:` tag.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
            Self::Urgent => "urgent",
        }
    }
}

impl std::str::FromStr for TaskPriority {
    type Err = TaskError;
    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "none" => Ok(Self::None),
            "low" => Ok(Self::Low),
            "medium" => Ok(Self::Medium),
            "high" => Ok(Self::High),
            "urgent" => Ok(Self::Urgent),
            _ => Err(TaskError::InvalidPriority),
        }
    }
}

/// Task protocol validation error.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum TaskError {
    /// Stable task identifier is missing or malformed.
    #[error("task id must be a UUID")]
    InvalidId,
    /// Title is absent, blank, or too long.
    #[error("task title must contain 1..=256 bytes")]
    InvalidTitle,
    /// Description exceeds its limit.
    #[error("task description exceeds 65536 bytes")]
    DescriptionTooLong,
    /// Status is not recognized.
    #[error("invalid task status")]
    InvalidStatus,
    /// Priority is not recognized.
    #[error("invalid task priority")]
    InvalidPriority,
}

/// Extract the stable UUID from a `task-id:` t-tag.
pub fn task_id(event: &Event) -> Result<Uuid, TaskError> {
    let value = event.tags.iter().find_map(|tag| {
        let parts = tag.as_slice();
        (parts.len() == 2 && parts[0].as_str() == "t")
            .then(|| parts[1].as_str().strip_prefix("task-id:"))
            .flatten()
    });
    value
        .and_then(|v| Uuid::parse_str(v).ok())
        .ok_or(TaskError::InvalidId)
}

/// Validate a user-facing title.
pub fn validate_title(title: &str) -> Result<(), TaskError> {
    if title.trim().is_empty() || title.len() > TASK_TITLE_MAX_BYTES {
        Err(TaskError::InvalidTitle)
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_validation_rejects_blank_and_oversized_values() {
        assert_eq!(validate_title("  ").unwrap_err(), TaskError::InvalidTitle);
        assert_eq!(
            validate_title(&"x".repeat(257)).unwrap_err(),
            TaskError::InvalidTitle
        );
        validate_title("Ship Tasks").unwrap();
    }
}
