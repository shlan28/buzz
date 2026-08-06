//! Domain types and validation for Buzz Tracks events.

use chrono::NaiveDate;
use nostr::Event;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Maximum UTF-8 byte length of a Track name.
pub const TRACK_NAME_MAX_BYTES: usize = 256;
/// Maximum UTF-8 byte length of a Track description.
pub const TRACK_DESCRIPTION_MAX_BYTES: usize = 65_536;

/// Track lifecycle state. Archival is deliberately represented separately.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TrackStatus {
    /// Work is being planned but has not started.
    Planned,
    /// Work is currently underway.
    Active,
    /// The intended work has finished.
    Completed,
    /// Work was intentionally stopped.
    Canceled,
}

impl TrackStatus {
    /// Wire value used by the `track-status:` tag.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Planned => "planned",
            Self::Active => "active",
            Self::Completed => "completed",
            Self::Canceled => "canceled",
        }
    }

    /// Whether a Track in this lifecycle state may be archived.
    pub const fn can_archive(self) -> bool {
        matches!(self, Self::Completed | Self::Canceled)
    }
}

impl std::str::FromStr for TrackStatus {
    type Err = TrackError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "planned" => Ok(Self::Planned),
            "active" => Ok(Self::Active),
            "completed" => Ok(Self::Completed),
            "canceled" => Ok(Self::Canceled),
            _ => Err(TrackError::InvalidStatus),
        }
    }
}

/// Track protocol validation error.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum TrackError {
    /// Stable Track identifier is missing or malformed.
    #[error("track id must be a UUID")]
    InvalidId,
    /// Name is absent, blank, or too long.
    #[error("track name must contain 1..=256 bytes")]
    InvalidName,
    /// Description exceeds its limit.
    #[error("track description exceeds 65536 bytes")]
    DescriptionTooLong,
    /// Owner is absent or is not a 32-byte hexadecimal public key.
    #[error("track owner must be a 64-character hex pubkey")]
    InvalidOwner,
    /// A date is not a calendar date in `YYYY-MM-DD` form.
    #[error("track dates must use YYYY-MM-DD")]
    InvalidDate,
    /// The end date precedes the start date.
    #[error("track end date must not precede its start date")]
    InvalidDateRange,
    /// Status is not recognized.
    #[error("invalid track status")]
    InvalidStatus,
    /// Archived value is not a wire-format boolean.
    #[error("track archived must be true or false")]
    InvalidArchived,
    /// Only terminal Tracks may be archived.
    #[error("only completed or canceled tracks may be archived")]
    InvalidArchiveState,
}

/// Extract the stable UUID from a Track command's `track-id:` t-tag or a
/// Track State's `d` tag.
pub fn track_id(event: &Event) -> Result<Uuid, TrackError> {
    let value = event.tags.iter().find_map(|tag| {
        let parts = tag.as_slice();
        if parts.len() != 2 {
            return None;
        }
        match parts[0].as_str() {
            "t" => parts[1].strip_prefix("track-id:"),
            "d" => Some(parts[1].as_str()),
            _ => None,
        }
    });
    value
        .and_then(|value| Uuid::parse_str(value).ok())
        .ok_or(TrackError::InvalidId)
}

/// Validate a user-facing Track name.
pub fn validate_name(name: &str) -> Result<(), TrackError> {
    if name.trim().is_empty() || name.len() > TRACK_NAME_MAX_BYTES {
        Err(TrackError::InvalidName)
    } else {
        Ok(())
    }
}

/// Validate a Track owner public key.
pub fn validate_owner(owner: &str) -> Result<(), TrackError> {
    if owner.len() == 64 && owner.chars().all(|value| value.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err(TrackError::InvalidOwner)
    }
}

/// Validate a required date-only range.
pub fn validate_date_range(start_date: &str, end_date: &str) -> Result<(), TrackError> {
    let start = validate_date(start_date)?;
    let end = validate_date(end_date)?;
    if end < start {
        Err(TrackError::InvalidDateRange)
    } else {
        Ok(())
    }
}

/// Parse and validate one date-only wire value.
pub fn validate_date(value: &str) -> Result<NaiveDate, TrackError> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").map_err(|_| TrackError::InvalidDate)
}

/// Validate the archival invariant for a complete Track state.
pub fn validate_archive(status: TrackStatus, archived: bool) -> Result<(), TrackError> {
    if archived && !status.can_archive() {
        Err(TrackError::InvalidArchiveState)
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_name_and_date_range() {
        assert_eq!(validate_name("  ").unwrap_err(), TrackError::InvalidName);
        validate_name("Desktop foundations").unwrap();
        validate_date_range("2026-08-01", "2026-08-30").unwrap();
        assert_eq!(
            validate_date_range("2026-08-30", "2026-08-01").unwrap_err(),
            TrackError::InvalidDateRange
        );
        assert_eq!(
            validate_date_range("2026-02-30", "2026-03-01").unwrap_err(),
            TrackError::InvalidDate
        );
    }

    #[test]
    fn archive_requires_terminal_status() {
        assert_eq!(
            validate_archive(TrackStatus::Active, true).unwrap_err(),
            TrackError::InvalidArchiveState
        );
        validate_archive(TrackStatus::Completed, true).unwrap();
        validate_archive(TrackStatus::Active, false).unwrap();
    }
}
