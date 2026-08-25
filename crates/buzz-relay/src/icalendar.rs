//! RFC 5545 serialization for Buzz Calendar subscription snapshots.

use chrono::{DateTime, NaiveDate, Utc};
use sha2::{Digest, Sha256};

/// Maximum number of events emitted in one subscription snapshot.
pub const MAX_EVENTS: usize = 50_000;
/// Maximum serialized response size, in bytes.
pub const MAX_FEED_BYTES: usize = 20 * 1024 * 1024;

/// Calendar time range after the NIP-52 tags have been validated.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CalendarTime {
    /// A date-only range. `end` is exclusive under RFC 5545 and NIP-52.
    AllDay {
        /// Inclusive start date.
        start: NaiveDate,
        /// Exclusive end date.
        end: NaiveDate,
    },
    /// A timed range represented as absolute UTC instants.
    Timed {
        /// Inclusive start instant.
        start: DateTime<Utc>,
        /// Exclusive end instant.
        end: DateTime<Utc>,
    },
}

/// A latest NIP-33 Calendar event head ready for serialization.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CalendarEvent {
    /// NIP-52 event kind (`31922` or `31923`).
    pub kind: u16,
    /// Hex event author pubkey.
    pub author: String,
    /// Stable NIP-33 `d` identifier.
    pub identifier: String,
    /// Human-readable title.
    pub title: String,
    /// Optional event description.
    pub description: Option<String>,
    /// Optional location.
    pub location: Option<String>,
    /// Time range.
    pub time: CalendarTime,
    /// Replacement head timestamp.
    pub modified_at: DateTime<Utc>,
    /// Optional Buzz deep link containing no subscription secret.
    pub url: Option<String>,
}

/// Fully rendered subscription body and its strong ETag.
#[derive(Debug, Eq, PartialEq)]
pub struct CalendarSnapshot {
    /// RFC 5545 bytes encoded as UTF-8 with CRLF line endings.
    pub body: Vec<u8>,
    /// Quoted SHA-256 ETag over `body`.
    pub etag: String,
    /// Number of malformed events omitted from the feed.
    pub skipped: usize,
}

/// Snapshot construction failure.
#[derive(Debug, thiserror::Error, Eq, PartialEq)]
pub enum CalendarError {
    /// The result would exceed the explicit event limit.
    #[error("calendar event limit exceeded")]
    EventLimit,
    /// The serialized feed would exceed the explicit byte limit.
    #[error("calendar feed size limit exceeded")]
    FeedSizeLimit,
}

/// Render a deterministic RFC 5545 snapshot.
pub fn render_calendar(
    community_host: &str,
    mut events: Vec<CalendarEvent>,
) -> Result<CalendarSnapshot, CalendarError> {
    if events.len() > MAX_EVENTS {
        return Err(CalendarError::EventLimit);
    }
    events.sort_by(|left, right| sort_key(left).cmp(&sort_key(right)));

    let mut logical = vec![
        "BEGIN:VCALENDAR".to_owned(),
        "VERSION:2.0".to_owned(),
        "PRODID:-//Buzz//Buzz Calendar//EN".to_owned(),
        "CALSCALE:GREGORIAN".to_owned(),
        "METHOD:PUBLISH".to_owned(),
        "X-WR-CALNAME:Buzz Calendar".to_owned(),
        "X-WR-CALDESC:My Buzz calendar events".to_owned(),
    ];
    let mut skipped = 0;
    for event in &events {
        match event_lines(community_host, event) {
            Some(lines) => logical.extend(lines),
            None => skipped += 1,
        }
    }
    logical.push("END:VCALENDAR".to_owned());

    let mut body = Vec::new();
    for line in logical {
        for folded in fold_line(&line) {
            body.extend_from_slice(folded.as_bytes());
            body.extend_from_slice(b"\r\n");
        }
        if body.len() > MAX_FEED_BYTES {
            return Err(CalendarError::FeedSizeLimit);
        }
    }
    let etag = format!("\"{}\"", hex::encode(Sha256::digest(&body)));
    Ok(CalendarSnapshot {
        body,
        etag,
        skipped,
    })
}

fn event_lines(host: &str, event: &CalendarEvent) -> Option<Vec<String>> {
    if event.title.is_empty()
        || event.identifier.is_empty()
        || !matches!(event.kind, 31922 | 31923)
        || match event.time {
            CalendarTime::AllDay { start, end } => end <= start,
            CalendarTime::Timed { start, end } => end <= start,
        }
    {
        return None;
    }
    let modified = event.modified_at.format("%Y%m%dT%H%M%SZ");
    let mut lines = vec![
        "BEGIN:VEVENT".to_owned(),
        format!(
            "UID:{}",
            escape_text(&format!(
                "{}-{}-{}@{}",
                event.kind, event.author, event.identifier, host
            ))
        ),
        format!("DTSTAMP:{modified}"),
        format!("LAST-MODIFIED:{modified}"),
        format!("SUMMARY:{}", escape_text(&event.title)),
    ];
    match event.time {
        CalendarTime::AllDay { start, end } => {
            lines.push(format!("DTSTART;VALUE=DATE:{}", start.format("%Y%m%d")));
            lines.push(format!("DTEND;VALUE=DATE:{}", end.format("%Y%m%d")));
        }
        CalendarTime::Timed { start, end } => {
            lines.push(format!("DTSTART:{}", start.format("%Y%m%dT%H%M%SZ")));
            lines.push(format!("DTEND:{}", end.format("%Y%m%dT%H%M%SZ")));
        }
    }
    if let Some(value) = event.description.as_deref().filter(|v| !v.is_empty()) {
        lines.push(format!("DESCRIPTION:{}", escape_text(value)));
    }
    if let Some(value) = event.location.as_deref().filter(|v| !v.is_empty()) {
        lines.push(format!("LOCATION:{}", escape_text(value)));
    }
    if let Some(value) = event.url.as_deref().filter(|v| !v.is_empty()) {
        lines.push(format!("URL:{}", escape_text(value)));
    }
    lines.push("END:VEVENT".to_owned());
    Some(lines)
}

fn sort_key(event: &CalendarEvent) -> (i64, u16, &str, &str) {
    let start = match event.time {
        CalendarTime::AllDay { start, .. } => start
            .and_hms_opt(0, 0, 0)
            .map(|value| value.and_utc().timestamp())
            .unwrap_or(i64::MIN),
        CalendarTime::Timed { start, .. } => start.timestamp(),
    };
    (start, event.kind, &event.author, &event.identifier)
}

fn escape_text(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    let mut chars = value.chars().peekable();
    while let Some(character) = chars.next() {
        match character {
            '\r' => {
                if chars.peek() == Some(&'\n') {
                    chars.next();
                }
                escaped.push_str("\\n");
            }
            '\n' => escaped.push_str("\\n"),
            '\\' => escaped.push_str("\\\\"),
            ';' => escaped.push_str("\\;"),
            ',' => escaped.push_str("\\,"),
            other => escaped.push(other),
        }
    }
    escaped
}

/// Fold one content line at 75 octets without splitting a UTF-8 code point.
fn fold_line(line: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut remaining = line;
    let mut first = true;
    while !remaining.is_empty() {
        let limit = if first { 75 } else { 74 };
        let mut split = remaining.len().min(limit);
        while split > 0 && !remaining.is_char_boundary(split) {
            split -= 1;
        }
        // A Unicode scalar is at most four bytes, so this is only reachable for
        // an empty input (handled by the loop condition).
        if split == 0 {
            split = remaining.len();
        }
        let (part, rest) = remaining.split_at(split);
        result.push(if first {
            part.to_owned()
        } else {
            format!(" {part}")
        });
        first = false;
        remaining = rest;
    }
    if result.is_empty() {
        result.push(String::new());
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn event(time: CalendarTime) -> CalendarEvent {
        CalendarEvent {
            kind: 31923,
            author: "aa".repeat(32),
            identifier: "standup".to_owned(),
            title: "研发,同步; \n下一行\\".to_owned(),
            description: None,
            location: Some("上海, 中国".to_owned()),
            time,
            modified_at: Utc.with_ymd_and_hms(2026, 8, 25, 2, 30, 0).unwrap(),
            url: Some("buzz://calendar?kind=31923&d=standup".to_owned()),
        }
    }

    #[test]
    fn timed_events_use_utc_and_escape_text() {
        let snapshot = render_calendar(
            "achoverse.xyz",
            vec![event(CalendarTime::Timed {
                start: Utc.with_ymd_and_hms(2026, 8, 25, 3, 0, 0).unwrap(),
                end: Utc.with_ymd_and_hms(2026, 8, 25, 4, 0, 0).unwrap(),
            })],
        )
        .unwrap();
        let text = String::from_utf8(snapshot.body)
            .unwrap()
            .replace("\r\n ", "");
        assert!(text.contains("DTSTART:20260825T030000Z\r\n"));
        assert!(text.contains("SUMMARY:研发\\,同步\\; \\n下一行\\\\\r\n"));
        assert!(text.contains("LOCATION:上海\\, 中国\r\n"));
    }

    #[test]
    fn all_day_end_is_exclusive() {
        let mut item = event(CalendarTime::AllDay {
            start: NaiveDate::from_ymd_opt(2026, 8, 25).unwrap(),
            end: NaiveDate::from_ymd_opt(2026, 8, 27).unwrap(),
        });
        item.kind = 31922;
        let text =
            String::from_utf8(render_calendar("buzz.test", vec![item]).unwrap().body).unwrap();
        assert!(text.contains("DTSTART;VALUE=DATE:20260825\r\n"));
        assert!(text.contains("DTEND;VALUE=DATE:20260827\r\n"));
    }

    #[test]
    fn folding_obeys_octet_limit_and_utf8_boundaries() {
        let folded = fold_line(&format!("DESCRIPTION:{}", "日".repeat(80)));
        assert!(folded.len() > 2);
        assert!(folded.iter().all(|line| line.len() <= 75));
        assert!(folded.iter().skip(1).all(|line| line.starts_with(' ')));
        let unfolded = folded
            .iter()
            .enumerate()
            .map(|(index, line)| {
                if index == 0 {
                    line.as_str()
                } else {
                    &line[1..]
                }
            })
            .collect::<String>();
        assert_eq!(unfolded, format!("DESCRIPTION:{}", "日".repeat(80)));
    }

    #[test]
    fn serialization_and_etag_are_stable_across_input_order() {
        let first = event(CalendarTime::Timed {
            start: Utc.with_ymd_and_hms(2026, 8, 26, 3, 0, 0).unwrap(),
            end: Utc.with_ymd_and_hms(2026, 8, 26, 4, 0, 0).unwrap(),
        });
        let mut second = event(CalendarTime::Timed {
            start: Utc.with_ymd_and_hms(2026, 8, 25, 3, 0, 0).unwrap(),
            end: Utc.with_ymd_and_hms(2026, 8, 25, 4, 0, 0).unwrap(),
        });
        second.identifier = "earlier".to_owned();
        let left = render_calendar("buzz.test", vec![first.clone(), second.clone()]).unwrap();
        let right = render_calendar("buzz.test", vec![second, first]).unwrap();
        assert_eq!(left, right);
    }

    #[test]
    fn malformed_event_is_skipped() {
        let mut item = event(CalendarTime::Timed {
            start: Utc.with_ymd_and_hms(2026, 8, 25, 4, 0, 0).unwrap(),
            end: Utc.with_ymd_and_hms(2026, 8, 25, 3, 0, 0).unwrap(),
        });
        item.title.clear();
        let snapshot = render_calendar("buzz.test", vec![item]).unwrap();
        assert_eq!(snapshot.skipped, 1);
        assert!(!String::from_utf8(snapshot.body)
            .unwrap()
            .contains("BEGIN:VEVENT"));
    }

    #[test]
    fn crlf_is_one_escaped_newline() {
        assert_eq!(
            escape_text("first\r\nsecond\rthird\nfourth"),
            "first\\nsecond\\nthird\\nfourth"
        );
    }
}
