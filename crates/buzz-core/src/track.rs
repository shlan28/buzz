//! Domain types and validation for Buzz Tracks events.

use chrono::NaiveDate;
use nostr::Event;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Maximum UTF-8 byte length of a Track name.
pub const TRACK_NAME_MAX_BYTES: usize = 256;
/// Maximum UTF-8 byte length of a Track description.
pub const TRACK_DESCRIPTION_MAX_BYTES: usize = 65_536;

/// Return whether `viewer_pubkey_hex` is directly listed in a Track State's
/// ACL as its creator, current owner, or an explicit member.
///
/// Managed-Agent inheritance is intentionally not handled here because it
/// depends on current community identity state in the database.
pub fn direct_viewer_authorized(event: &Event, viewer_pubkey_hex: &str) -> bool {
    event.tags.iter().any(|tag| {
        let parts = tag.as_slice();
        parts.len() >= 2
            && matches!(parts[0].as_str(), "creator" | "p" | "member")
            && parts[1].eq_ignore_ascii_case(viewer_pubkey_hex)
    })
}

/// Validate and deduplicate a complete explicit-member set while preserving
/// its input order.
pub fn validate_members<'a>(
    members: impl IntoIterator<Item = &'a str>,
) -> Result<Vec<String>, TrackError> {
    let mut seen = std::collections::HashSet::new();
    let mut validated = Vec::new();
    for member in members {
        validate_owner(member).map_err(|_| TrackError::InvalidMember)?;
        let normalized = member.to_ascii_lowercase();
        if seen.insert(normalized.clone()) {
            validated.push(normalized);
        }
    }
    Ok(validated)
}

/// Validate a complete member set and reject a redundant owner entry.
pub fn validate_members_for_owner<'a>(
    owner: &str,
    members: impl IntoIterator<Item = &'a str>,
) -> Result<Vec<String>, TrackError> {
    let members = validate_members(members)?;
    if members
        .iter()
        .any(|member| member.eq_ignore_ascii_case(owner))
    {
        return Err(TrackError::OwnerIsMember);
    }
    Ok(members)
}

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
    /// An explicit member is not a 32-byte hexadecimal public key.
    #[error("track member must be a 64-character hex pubkey")]
    InvalidMember,
    /// The owner was redundantly included in the explicit member set.
    #[error("track owner must not also be an explicit member")]
    OwnerIsMember,
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

    #[test]
    fn member_validation_deduplicates_and_direct_acl_matches() {
        let keys = nostr::Keys::generate();
        let viewer = keys.public_key().to_hex();
        let members =
            validate_members([viewer.as_str(), viewer.to_ascii_uppercase().as_str()]).unwrap();
        assert_eq!(members, vec![viewer.clone()]);
        let event = nostr::EventBuilder::new(nostr::Kind::Custom(30_510), "")
            .tags([nostr::Tag::parse(["member", &viewer]).unwrap()])
            .sign_with_keys(&nostr::Keys::generate())
            .unwrap();
        assert!(direct_viewer_authorized(&event, &viewer));
        assert!(!direct_viewer_authorized(
            &event,
            &nostr::Keys::generate().public_key().to_hex()
        ));
        assert_eq!(
            validate_members_for_owner(&viewer, [viewer.as_str()]).unwrap_err(),
            TrackError::OwnerIsMember
        );
    }
}
