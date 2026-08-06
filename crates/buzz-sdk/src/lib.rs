#![deny(unsafe_code)]
#![warn(missing_docs)]
//! `buzz-sdk` — typed Nostr event builders for Buzz operations.
//!
//! # Mental Model
//!
//! ```text
//! caller params → builder fn → validates → EventBuilder → caller signs → Event
//! ```
//!
//! Each builder function validates its inputs and returns an [`nostr::EventBuilder`].
//! The caller signs with their own keys: `builder.sign_with_keys(&keys)?`.
//! No keys are held here. No network calls are made.

pub mod builders;
pub mod mentions;
pub mod nip_oa;

pub use builders::*;

/// Re-export kind constants so consumers don't need buzz-core directly.
pub use buzz_core::kind;
pub use buzz_core::task::{TaskPriority, TaskStatus};
pub use buzz_core::track::TrackStatus;

/// Complete input for a task create command.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskCreateInput {
    /// Stable client-generated UUID.
    pub id: uuid::Uuid,
    /// Human-readable title.
    pub title: String,
    /// Markdown description.
    pub description: String,
    /// Optional assignee pubkey.
    pub assignee: Option<String>,
    /// Initial workflow status.
    pub status: TaskStatus,
    /// Initial priority.
    pub priority: TaskPriority,
    /// Optional Unix due time.
    pub due: Option<i64>,
    /// Labels without the `label:` prefix.
    pub labels: Vec<String>,
    /// Optional NIP-34 repository coordinate.
    pub project: Option<String>,
    /// Optional Buzz Track UUID. Independent from the NIP-34 repository coordinate.
    pub track: Option<uuid::Uuid>,
    /// Optional channel UUID.
    pub channel: Option<uuid::Uuid>,
    /// Optional source message event ID.
    pub source_event: Option<String>,
}

/// Explicit changes for a task mutation command.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TaskMutateInput {
    /// Stable task UUID.
    pub id: uuid::Uuid,
    /// Current Task State event ID used for optimistic concurrency.
    pub previous_event: String,
    /// Replacement title.
    pub title: Option<String>,
    /// Replacement description; `Some(None)` clears it.
    pub description: Option<Option<String>>,
    /// Replacement assignee; `Some(None)` clears it.
    pub assignee: Option<Option<String>>,
    /// Replacement status.
    pub status: Option<TaskStatus>,
    /// Replacement priority.
    pub priority: Option<TaskPriority>,
    /// Replacement due time; `Some(None)` clears it.
    pub due: Option<Option<i64>>,
    /// Complete replacement labels.
    pub labels: Option<Vec<String>>,
    /// Replacement project; `Some(None)` clears it.
    pub project: Option<Option<String>>,
    /// Replacement Track; `Some(None)` clears it.
    pub track: Option<Option<uuid::Uuid>>,
    /// Replacement channel; `Some(None)` clears it.
    pub channel: Option<Option<uuid::Uuid>>,
    /// Replacement source event; `Some(None)` clears it.
    pub source_event: Option<Option<String>>,
    /// Archive or restore the task.
    pub archived: Option<bool>,
}

/// Complete input for a Track create command.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrackCreateInput {
    /// Stable client-generated UUID.
    pub id: uuid::Uuid,
    /// Human-readable Track name.
    pub name: String,
    /// Markdown description.
    pub description: String,
    /// Responsible Person or Agent public key in hexadecimal.
    pub owner: String,
    /// Explicit read-only Track members.
    pub members: Vec<String>,
    /// Required date-only start in `YYYY-MM-DD` form.
    pub start_date: String,
    /// Required date-only target end in `YYYY-MM-DD` form.
    pub end_date: String,
    /// Initial lifecycle state.
    pub status: TrackStatus,
}

/// Explicit changes for a Track mutation command.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TrackMutateInput {
    /// Stable Track UUID.
    pub id: uuid::Uuid,
    /// Current Track State event ID used for optimistic concurrency.
    pub previous_event: String,
    /// Replacement name.
    pub name: Option<String>,
    /// Replacement description; `Some(None)` clears it.
    pub description: Option<Option<String>>,
    /// Replacement owner public key.
    pub owner: Option<String>,
    /// Complete replacement member set. An empty set clears all members.
    pub members: Option<Vec<String>>,
    /// Replacement start date.
    pub start_date: Option<String>,
    /// Replacement end date.
    pub end_date: Option<String>,
    /// Replacement lifecycle state.
    pub status: Option<TrackStatus>,
    /// Archive or restore the Track.
    pub archived: Option<bool>,
}

/// Minimal input for an actor-signed task soft-delete command.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskDeleteInput {
    /// Stable task UUID.
    pub id: uuid::Uuid,
    /// Current Task State event ID used for optimistic concurrency.
    pub previous_event: String,
}

/// Input for requesting that the assigned Agent execute a task.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskExecutionRequestInput {
    /// Stable task UUID.
    pub task_id: uuid::Uuid,
    /// Unique UUID for this execution attempt.
    pub execution_id: uuid::Uuid,
    /// Current Task State event ID used for optimistic concurrency.
    pub expected_event: String,
    /// Assigned Agent pubkey copied from the current task state.
    pub assignee: String,
    /// Optional task channel, used only for visibility scoping.
    pub channel: Option<uuid::Uuid>,
}

/// Agent-reported execution lifecycle state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TaskExecutionStatus {
    /// The Agent has exclusively claimed the execution.
    Running,
    /// The Agent turn ended normally.
    Finished,
    /// The Agent could not start or continue the turn.
    Failed,
}

impl TaskExecutionStatus {
    /// Stable tag value.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Running => "running",
            Self::Finished => "finished",
            Self::Failed => "failed",
        }
    }
}

/// Input for an assigned Agent execution update.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskExecutionUpdateInput {
    /// Stable task UUID.
    pub task_id: uuid::Uuid,
    /// Execution UUID returned by the request.
    pub execution_id: uuid::Uuid,
    /// Desired lifecycle transition.
    pub status: TaskExecutionStatus,
    /// Optional failure explanation; empty for non-failure updates.
    pub message: String,
}

/// Thread reference for reply builders (NIP-10 markers).
///
/// - Direct reply (root == parent): emits `["e", root, "", "reply"]`
/// - Nested reply (root ≠ parent): emits `["e", root, "", "root"]` + `["e", parent, "", "reply"]`
pub struct ThreadRef {
    /// The root event of the thread.
    pub root_event_id: nostr::EventId,
    /// The immediate parent being replied to.
    pub parent_event_id: nostr::EventId,
}

/// Metadata for diff/patch messages (kind 40008).
pub struct DiffMeta {
    /// Repository URL — required, must start with `http://` or `https://`.
    pub repo_url: String,
    /// Commit SHA — required, minimum 7 hex characters.
    pub commit_sha: String,
    /// Optional file path within the repository.
    pub file_path: Option<String>,
    /// Optional parent commit SHA — minimum 7 hex chars if present.
    pub parent_commit: Option<String>,
    /// Optional branch pair `(source, target)` — both or neither.
    pub branch: Option<(String, String)>,
    /// Optional pull request number — must be positive.
    pub pr_number: Option<u32>,
    /// Optional programming language identifier.
    pub language: Option<String>,
    /// Optional human-readable description.
    pub description: Option<String>,
    /// Whether the diff was truncated due to size.
    pub truncated: bool,
    /// Optional alt text for accessibility.
    pub alt_text: Option<String>,
}

/// Vote direction for `build_vote`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VoteDirection {
    /// Upvote — content `"+"`.
    Up,
    /// Downvote — content `"-"`.
    Down,
}

/// A NIP-30 custom emoji tag payload.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CustomEmoji {
    /// The shortcode without surrounding colons.
    pub shortcode: String,
    /// Image URL for this custom emoji.
    pub url: String,
}

/// A participant attached to a NIP-52 calendar event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CalendarParticipant {
    /// Participant public key as 64-character hexadecimal.
    pub pubkey: String,
    /// Optional participation role (for example `required` or `optional`).
    pub role: Option<String>,
}

/// Complete input used to publish a NIP-52 calendar event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CalendarEventInput {
    /// Stable `d` identifier reused by later replacements.
    pub id: String,
    /// Human-readable title.
    pub title: String,
    /// Optional longer description, stored as event content.
    pub description: String,
    /// Start value: `YYYY-MM-DD` for all-day events, Unix seconds otherwise.
    pub start: String,
    /// Exclusive end value in the same representation as `start`.
    pub end: Option<String>,
    /// Whether this is a date-based (kind 31922) event.
    pub all_day: bool,
    /// IANA timezone for the start of a timed event.
    pub start_tzid: Option<String>,
    /// IANA timezone for the end of a timed event.
    pub end_tzid: Option<String>,
    /// Optional short summary.
    pub summary: Option<String>,
    /// Zero or more human-readable locations.
    pub locations: Vec<String>,
    /// Zero or more participant pubkeys.
    pub participants: Vec<CalendarParticipant>,
    /// Calendar collection identifiers containing this event.
    pub calendar_ids: Vec<String>,
}

/// Return a channel name without client-rendered leading hash prefixes.
pub use buzz_core::channel::canonical_channel_name;
/// Channel type.
pub use buzz_core::channel::ChannelType as ChannelKind;
/// Channel visibility.
pub use buzz_core::channel::ChannelVisibility as Visibility;
/// Member role.
pub use buzz_core::channel::MemberRole;

/// Errors returned by SDK builder functions.
#[derive(Debug, thiserror::Error)]
pub enum SdkError {
    /// Content exceeds the maximum allowed size.
    #[error("content exceeds maximum size of {max} bytes (got {got})")]
    ContentTooLarge {
        /// Maximum allowed bytes.
        max: usize,
        /// Actual byte count.
        got: usize,
    },
    /// A tag could not be constructed.
    #[error("invalid tag: {0}")]
    InvalidTag(String),
    /// Emoji string exceeds 64 characters.
    #[error("emoji exceeds maximum length of 64 characters")]
    EmojiTooLong,
    /// More than 50 mentions were supplied.
    #[error("too many mentions (max 50)")]
    TooManyMentions,
    /// Diff metadata failed validation.
    #[error("invalid diff metadata: {0}")]
    InvalidDiffMeta(String),
    /// Input failed validation (e.g. malformed pubkey).
    #[error("invalid input: {0}")]
    InvalidInput(String),
}
