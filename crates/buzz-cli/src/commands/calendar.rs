//! `buzz calendar` — private, author-scoped NIP-52 calendar operations.

use chrono::{DateTime, Datelike, Duration, FixedOffset, NaiveDate, Offset, TimeZone, Utc};
use nostr::{Event, PublicKey};
use serde::Serialize;

use crate::{client::BuzzClient, error::CliError, CalendarCmd};
use buzz_sdk::{
    build_calendar_event, build_delete_calendar_event, CalendarEventInput, CalendarParticipant,
    CalendarSeries, KIND_CALENDAR_DATE, KIND_CALENDAR_TIME,
};

const MAX_OCCURRENCES: u16 = 365;

#[derive(Debug, Clone, PartialEq, Eq)]
enum RecurrenceRule {
    Daily,
    Weekdays(Vec<u32>),
    MonthDays(Vec<u32>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum RecurrenceEnd {
    Count(u16),
    Until(NaiveDate),
}

#[derive(Debug, Clone, Serialize)]
struct CalendarSnapshot {
    id: String,
    coordinate: String,
    author: String,
    kind: u16,
    title: String,
    description: String,
    start: String,
    end: Option<String>,
    start_tzid: Option<String>,
    end_tzid: Option<String>,
    all_day: bool,
    summary: Option<String>,
    locations: Vec<String>,
    participants: Vec<String>,
    calendar_ids: Vec<String>,
    series: Option<CalendarSeries>,
    updated_at: u64,
    event_id: String,
}

impl CalendarSnapshot {
    fn from_event(event: &Event) -> Result<Self, CliError> {
        let kind = event.kind.as_u16();
        if !matches!(kind, KIND_CALENDAR_DATE | KIND_CALENDAR_TIME) {
            return Err(CliError::Other(format!("unexpected calendar kind {kind}")));
        }
        let mut id = None;
        let mut title = None;
        let mut start = None;
        let mut end = None;
        let mut start_tzid = None;
        let mut end_tzid = None;
        let mut summary = None;
        let mut locations = Vec::new();
        let mut participants = Vec::new();
        let mut calendar_ids = Vec::new();
        let mut series_id = None;
        let mut series_occurrence = None;
        let mut series_repeat = None;
        let mut series_values = None;
        let mut series_end = None;
        for tag in event.tags.iter() {
            let parts = tag.as_slice();
            let Some(name) = parts.first().map(String::as_str) else {
                continue;
            };
            let value = parts.get(1).cloned().unwrap_or_default();
            match name {
                "d" => id = Some(value),
                "title" => title = Some(value),
                "start" => start = Some(value),
                "end" => end = Some(value),
                "start_tzid" => start_tzid = Some(value),
                "end_tzid" => end_tzid = Some(value),
                "summary" => summary = Some(value),
                "location" => locations.push(value),
                "p" => participants.push(value),
                "a" => calendar_ids.push(value),
                "buzz_series" => series_id = Some(value),
                "buzz_occurrence" => series_occurrence = value.parse::<u16>().ok(),
                "buzz_repeat" => series_repeat = Some(value),
                "buzz_repeat_values" => series_values = Some(value),
                "buzz_repeat_end" => series_end = Some(value),
                _ => {}
            }
        }
        let id = id.ok_or_else(|| CliError::Other("calendar event is missing d tag".into()))?;
        let author = event.pubkey.to_hex();
        let series = match (series_id, series_occurrence, series_repeat, series_end) {
            (Some(id), Some(occurrence), Some(repeat), Some(end)) => Some(CalendarSeries {
                id,
                occurrence,
                repeat,
                values: series_values,
                end,
            }),
            _ => None,
        };
        Ok(Self {
            coordinate: format!("{kind}:{author}:{id}"),
            id,
            author,
            kind,
            title: title.unwrap_or_default(),
            description: event.content.clone(),
            start: start
                .ok_or_else(|| CliError::Other("calendar event is missing start tag".into()))?,
            end,
            start_tzid,
            end_tzid,
            all_day: kind == KIND_CALENDAR_DATE,
            summary,
            locations,
            participants,
            calendar_ids,
            series,
            updated_at: event.created_at.as_secs(),
            event_id: event.id.to_hex(),
        })
    }

    fn into_input(self) -> CalendarEventInput {
        CalendarEventInput {
            id: self.id,
            title: self.title,
            description: self.description,
            start: self.start,
            end: self.end,
            all_day: self.all_day,
            start_tzid: self.start_tzid,
            end_tzid: self.end_tzid,
            summary: self.summary,
            locations: self.locations,
            participants: self
                .participants
                .into_iter()
                .map(|pubkey| CalendarParticipant { pubkey, role: None })
                .collect(),
            calendar_ids: self.calendar_ids,
            series: self.series,
        }
    }
}

fn parse_events(raw: &str) -> Result<Vec<Event>, CliError> {
    serde_json::from_str(raw)
        .map_err(|error| CliError::Other(format!("failed to parse relay response: {error}")))
}

fn resolve_read_author(client: &BuzzClient, author: &str) -> Result<String, CliError> {
    normalize_read_author(author, &client.keys().public_key().to_hex())
}

fn normalize_read_author(author: &str, me: &str) -> Result<String, CliError> {
    if author == "me" {
        return Ok(me.to_string());
    }
    PublicKey::from_hex(author)
        .map(|pubkey| pubkey.to_hex())
        .map_err(|error| {
            CliError::Usage(format!("--author must be `me` or a 64-hex pubkey: {error}"))
        })
}

fn parse_date(value: &str, field: &str) -> Result<String, CliError> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map(|date| date.format("%Y-%m-%d").to_string())
        .map_err(|error| CliError::Usage(format!("invalid {field} date: {error}")))
}

fn parse_instant(value: &str, field: &str) -> Result<String, CliError> {
    if let Ok(seconds) = value.parse::<u64>() {
        return Ok(seconds.to_string());
    }
    DateTime::parse_from_rfc3339(value)
        .map(|date| date.timestamp().to_string())
        .map_err(|error| CliError::Usage(format!("invalid {field} timestamp: {error}")))
}

fn parse_window_boundary(value: &str, field: &str) -> Result<String, CliError> {
    if let Ok(date) = NaiveDate::parse_from_str(value, "%Y-%m-%d") {
        let midnight = date
            .and_hms_opt(0, 0, 0)
            .ok_or_else(|| CliError::Usage(format!("invalid {field} date")))?;
        return Ok(midnight.and_utc().timestamp().to_string());
    }
    parse_instant(value, field)
}

fn event_overlaps(snapshot: &CalendarSnapshot, from: i64, to: i64) -> bool {
    let boundary = |value: &str, all_day: bool| -> Option<i64> {
        if all_day {
            NaiveDate::parse_from_str(value, "%Y-%m-%d")
                .ok()?
                .and_hms_opt(0, 0, 0)
                .map(|date| date.and_utc().timestamp())
        } else {
            value.parse().ok()
        }
    };
    let Some(start) = boundary(&snapshot.start, snapshot.all_day) else {
        return false;
    };
    let end = snapshot
        .end
        .as_deref()
        .and_then(|value| boundary(value, snapshot.all_day))
        .unwrap_or_else(|| {
            if snapshot.all_day {
                start + 86_400
            } else {
                start + 1
            }
        });
    start < to && end > from
}

fn normalize_range(
    start: &str,
    end: Option<&str>,
    all_day: bool,
) -> Result<(String, Option<String>), CliError> {
    let start = if all_day {
        parse_date(start, "start")?
    } else {
        parse_instant(start, "start")?
    };
    let end = end
        .map(|value| {
            if all_day {
                parse_date(value, "end")
            } else {
                parse_instant(value, "end")
            }
        })
        .transpose()?;
    let invalid_end = end.as_ref().is_some_and(|end| {
        if all_day {
            end <= &start
        } else {
            end.parse::<i64>().ok() <= start.parse::<i64>().ok()
        }
    });
    if invalid_end {
        return Err(CliError::Usage("--end must be later than --start".into()));
    }
    Ok((start, end))
}

fn validate_timezone(timezone: Option<&str>, all_day: bool) -> Result<(), CliError> {
    if all_day && timezone.is_some() {
        return Err(CliError::Usage(
            "--timezone does not apply to all-day events".into(),
        ));
    }
    if let Some(value) = timezone {
        let valid = (value == "UTC" || value.contains('/'))
            && value.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '/' | '_' | '-' | '+')
            });
        if !valid {
            return Err(CliError::Usage(
                "--timezone must be an IANA identifier such as Asia/Shanghai".into(),
            ));
        }
    }
    Ok(())
}

fn participants(values: Vec<String>) -> Vec<CalendarParticipant> {
    values
        .into_iter()
        .map(|pubkey| CalendarParticipant { pubkey, role: None })
        .collect()
}

fn parse_csv_numbers(value: &str, min: u32, max: u32, field: &str) -> Result<Vec<u32>, CliError> {
    let mut values = value
        .split(',')
        .map(str::trim)
        .map(|item| {
            item.parse::<u32>().map_err(|_| {
                CliError::Usage(format!(
                    "{field} must be comma-separated values from {min} to {max}"
                ))
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    values.sort_unstable();
    values.dedup();
    if values.is_empty() || values.iter().any(|value| !(min..=max).contains(value)) {
        return Err(CliError::Usage(format!(
            "{field} must contain values from {min} to {max}"
        )));
    }
    Ok(values)
}

fn parse_recurrence(
    repeat: Option<String>,
    weekdays: Option<String>,
    month_days: Option<String>,
    repeat_count: Option<u16>,
    repeat_until: Option<String>,
    first_date: NaiveDate,
) -> Result<Option<(RecurrenceRule, RecurrenceEnd)>, CliError> {
    let rule = match (repeat, weekdays, month_days) {
        (None, None, None) => None,
        (Some(value), None, None) if value == "daily" => Some(RecurrenceRule::Daily),
        (Some(_), None, None) => {
            return Err(CliError::Usage(
                "--repeat currently accepts only `daily`".into(),
            ))
        }
        (None, Some(value), None) => {
            let names = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
            let mut values = value
                .split(',')
                .map(str::trim)
                .map(|item| {
                    names
                        .iter()
                        .position(|name| *name == item)
                        .map(|index| index as u32)
                        .ok_or_else(|| {
                            CliError::Usage("--weekdays uses mon,tue,wed,thu,fri,sat,sun".into())
                        })
                })
                .collect::<Result<Vec<_>, _>>()?;
            values.sort_unstable();
            values.dedup();
            Some(RecurrenceRule::Weekdays(values))
        }
        (None, None, Some(value)) => Some(RecurrenceRule::MonthDays(parse_csv_numbers(
            &value,
            1,
            31,
            "--month-days",
        )?)),
        _ => return Err(CliError::Usage("choose only one recurrence rule".into())),
    };
    let Some(rule) = rule else {
        if repeat_count.is_some() || repeat_until.is_some() {
            return Err(CliError::Usage(
                "--repeat-count/--repeat-until requires a recurrence rule".into(),
            ));
        }
        return Ok(None);
    };
    let end = match (repeat_count, repeat_until) {
        (Some(count), None) if (2..=MAX_OCCURRENCES).contains(&count) => {
            RecurrenceEnd::Count(count)
        }
        (Some(_), None) => {
            return Err(CliError::Usage(format!(
                "--repeat-count must be between 2 and {MAX_OCCURRENCES}"
            )))
        }
        (None, Some(value)) => {
            let until = NaiveDate::parse_from_str(&value, "%Y-%m-%d").map_err(|error| {
                CliError::Usage(format!("invalid --repeat-until date: {error}"))
            })?;
            if until < first_date {
                return Err(CliError::Usage(
                    "--repeat-until must not be before the first event".into(),
                ));
            }
            RecurrenceEnd::Until(until)
        }
        _ => {
            return Err(CliError::Usage(
                "a recurrence rule requires exactly one of --repeat-count or --repeat-until".into(),
            ))
        }
    };
    let first_value = match &rule {
        RecurrenceRule::Daily => None,
        RecurrenceRule::Weekdays(values) => {
            Some((values, first_date.weekday().num_days_from_sunday()))
        }
        RecurrenceRule::MonthDays(values) => Some((values, first_date.day())),
    };
    if first_value.is_some_and(|(values, first)| !values.contains(&first)) {
        return Err(CliError::Usage(
            "the recurrence rule must include the first event date".into(),
        ));
    }
    Ok(Some((rule, end)))
}

fn rule_matches(rule: &RecurrenceRule, date: NaiveDate) -> bool {
    match rule {
        RecurrenceRule::Daily => true,
        RecurrenceRule::Weekdays(values) => values.contains(&date.weekday().num_days_from_sunday()),
        RecurrenceRule::MonthDays(values) => values.contains(&date.day()),
    }
}

fn expand_recurrence(
    input: CalendarEventInput,
    rule: RecurrenceRule,
    boundary: RecurrenceEnd,
    fixed_offset: Option<FixedOffset>,
) -> Result<Vec<CalendarEventInput>, CliError> {
    let (first_date, local_time, timezone, duration) = if input.all_day {
        let start = NaiveDate::parse_from_str(&input.start, "%Y-%m-%d")
            .map_err(|error| CliError::Usage(error.to_string()))?;
        let end = input
            .end
            .as_deref()
            .map(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d"))
            .transpose()
            .map_err(|error| CliError::Usage(error.to_string()))?
            .unwrap_or(start + Duration::days(1));
        (
            start,
            None,
            None,
            end.signed_duration_since(start).num_seconds(),
        )
    } else {
        let offset = fixed_offset.unwrap_or_else(|| Utc.fix());
        let start_seconds = input
            .start
            .parse::<i64>()
            .map_err(|error| CliError::Usage(error.to_string()))?;
        let start = Utc
            .timestamp_opt(start_seconds, 0)
            .single()
            .ok_or_else(|| CliError::Usage("invalid start timestamp".into()))?
            .with_timezone(&offset);
        let end_seconds = input
            .end
            .as_deref()
            .unwrap_or(&input.start)
            .parse::<i64>()
            .map_err(|error| CliError::Usage(error.to_string()))?;
        (
            start.date_naive(),
            Some(start.time()),
            Some(offset),
            end_seconds - start_seconds,
        )
    };
    let values = match &rule {
        RecurrenceRule::Daily => None,
        RecurrenceRule::Weekdays(values) | RecurrenceRule::MonthDays(values) => Some(
            values
                .iter()
                .map(u32::to_string)
                .collect::<Vec<_>>()
                .join(","),
        ),
    };
    let repeat = match rule {
        RecurrenceRule::Daily => "daily",
        RecurrenceRule::Weekdays(_) => "weekdays",
        RecurrenceRule::MonthDays(_) => "month-days",
    };
    let end_label = match boundary {
        RecurrenceEnd::Count(count) => format!("count:{count}"),
        RecurrenceEnd::Until(until) => format!("until:{}", until.format("%Y-%m-%d")),
    };
    let target_count = match boundary {
        RecurrenceEnd::Count(count) => count as usize,
        RecurrenceEnd::Until(_) => MAX_OCCURRENCES as usize,
    };
    let series_id = input.id.clone();
    let mut date = first_date;
    let mut output = Vec::new();
    for _ in 0..40_000 {
        if matches!(boundary, RecurrenceEnd::Until(until) if date > until)
            || output.len() >= target_count
        {
            break;
        }
        if rule_matches(&rule, date) {
            let mut occurrence = input.clone();
            let index = output.len() as u16;
            occurrence.id = format!("{series_id}-{index}");
            if input.all_day {
                occurrence.start = date.format("%Y-%m-%d").to_string();
                occurrence.end = Some(
                    (date + Duration::seconds(duration))
                        .format("%Y-%m-%d")
                        .to_string(),
                );
            } else {
                let naive = date.and_time(local_time.unwrap_or_default());
                let instant = timezone
                    .and_then(|offset| offset.from_local_datetime(&naive).earliest())
                    .ok_or_else(|| {
                        CliError::Usage("recurrence falls in an invalid local time".into())
                    })?;
                let start = instant.timestamp();
                occurrence.start = start.to_string();
                occurrence.end = Some((start + duration).to_string());
            }
            occurrence.series = Some(CalendarSeries {
                id: series_id.clone(),
                occurrence: index,
                repeat: repeat.into(),
                values: values.clone(),
                end: end_label.clone(),
            });
            output.push(occurrence);
        }
        date += Duration::days(1);
    }
    if output.len() >= MAX_OCCURRENCES as usize
        && matches!(boundary, RecurrenceEnd::Until(until) if date <= until)
    {
        return Err(CliError::Usage(format!(
            "recurrence exceeds {MAX_OCCURRENCES} occurrences"
        )));
    }
    if output.is_empty() {
        return Err(CliError::Usage("recurrence creates no events".into()));
    }
    Ok(output)
}

async fn fetch_own(client: &BuzzClient, id: &str) -> Result<Option<Event>, CliError> {
    fetch_by_author(client, id, &client.keys().public_key().to_hex()).await
}

async fn fetch_by_author(
    client: &BuzzClient,
    id: &str,
    author: &str,
) -> Result<Option<Event>, CliError> {
    let filter = serde_json::json!({
        "kinds": [KIND_CALENDAR_DATE, KIND_CALENDAR_TIME],
        "authors": [author],
        "#d": [id],
        "limit": 2,
    });
    let mut events = parse_events(&client.query(&filter).await?)?;
    events.sort_by_key(|event| std::cmp::Reverse(event.created_at));
    Ok(events.into_iter().next())
}

fn ensure_expected(event: &Event, expected: Option<&str>) -> Result<(), CliError> {
    if expected.is_some_and(|expected| expected != event.id.to_hex()) {
        return Err(CliError::Conflict(format!(
            "current event is {}; expected {}",
            event.id.to_hex(),
            expected.unwrap_or_default()
        )));
    }
    Ok(())
}

async fn publish(
    client: &BuzzClient,
    builder: nostr::EventBuilder,
    stable_id: &str,
    coordinate_kind: u16,
) -> Result<(), CliError> {
    let event = client.sign_event(builder)?;
    let event_id = event.id.to_hex();
    let author = event.pubkey.to_hex();
    let raw = client.submit_event(event).await?;
    let response: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|error| CliError::Other(format!("relay response is not JSON: {error}")))?;
    if !response
        .get("accepted")
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
    {
        return Err(CliError::Other(format!(
            "relay rejected event: {}",
            response
                .get("message")
                .and_then(|value| value.as_str())
                .unwrap_or("")
        )));
    }
    println!(
        "{}",
        serde_json::json!({
            "event_id": event_id,
            "accepted": true,
            "message": response.get("message").and_then(|value| value.as_str()).unwrap_or("stored"),
            "calendar_event_id": stable_id,
            "coordinate": format!("{coordinate_kind}:{author}:{stable_id}"),
        })
    );
    Ok(())
}

pub async fn dispatch(command: CalendarCmd, client: &BuzzClient) -> Result<(), CliError> {
    match command {
        CalendarCmd::Create {
            title,
            start,
            end,
            timezone,
            all_day,
            description,
            summary,
            locations,
            participants: participant_values,
            calendars,
            id,
            repeat,
            weekdays,
            month_days,
            repeat_count,
            repeat_until,
        } => {
            validate_timezone(timezone.as_deref(), all_day)?;
            let fixed_offset = (!all_day)
                .then(|| {
                    DateTime::parse_from_rfc3339(&start)
                        .ok()
                        .map(|date| *date.offset())
                })
                .flatten();
            let (start, end) = normalize_range(&start, end.as_deref(), all_day)?;
            let id = id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            let input = CalendarEventInput {
                id: id.clone(),
                title,
                description: description.unwrap_or_default(),
                start,
                end,
                all_day,
                start_tzid: timezone.clone(),
                end_tzid: timezone,
                summary,
                locations,
                participants: participants(participant_values),
                calendar_ids: calendars,
                series: None,
            };
            let kind = if all_day {
                KIND_CALENDAR_DATE
            } else {
                KIND_CALENDAR_TIME
            };
            let first_date = if all_day {
                NaiveDate::parse_from_str(&input.start, "%Y-%m-%d")
                    .map_err(|error| CliError::Usage(error.to_string()))?
            } else {
                let offset = fixed_offset.unwrap_or_else(|| Utc.fix());
                Utc.timestamp_opt(
                    input
                        .start
                        .parse::<i64>()
                        .map_err(|error| CliError::Usage(error.to_string()))?,
                    0,
                )
                .single()
                .ok_or_else(|| CliError::Usage("invalid start timestamp".into()))?
                .with_timezone(&offset)
                .date_naive()
            };
            let recurrence = parse_recurrence(
                repeat,
                weekdays,
                month_days,
                repeat_count,
                repeat_until,
                first_date,
            )?;
            let inputs = match recurrence {
                Some((rule, boundary)) => expand_recurrence(input, rule, boundary, fixed_offset)?,
                None => vec![input],
            };
            let total = inputs.len();
            for (index, occurrence) in inputs.into_iter().enumerate() {
                publish(
                    client,
                    build_calendar_event(&occurrence)
                        .map_err(|e| CliError::Usage(e.to_string()))?,
                    &occurrence.id,
                    kind,
                )
                .await
                .map_err(|error| {
                    CliError::Other(format!(
                        "saved {index}/{total} occurrences; retry with the same --id: {error}"
                    ))
                })?;
            }
            Ok(())
        }
        CalendarCmd::List {
            from,
            to,
            calendar,
            author,
        } => {
            let author = resolve_read_author(client, &author)?;
            let from = parse_window_boundary(&from, "from")?;
            let to = parse_window_boundary(&to, "to")?;
            if to.parse::<i64>().ok() <= from.parse::<i64>().ok() {
                return Err(CliError::Usage("--to must be later than --from".into()));
            }
            let mut filter = serde_json::json!({ "kinds": [KIND_CALENDAR_DATE, KIND_CALENDAR_TIME], "authors": [author] });
            if let Some(calendar) = calendar {
                filter["#a"] = serde_json::json!([calendar]);
            }
            // Standard nostr::Filter drops unknown calendar range keys. Fetch every
            // author-scoped page with the client's composite cursor, then apply the
            // occurrence window locally so older-created future events are not lost.
            let values = client.query_all(filter).await?;
            let mut snapshots = values
                .into_iter()
                .map(|value| {
                    serde_json::from_value::<Event>(value).map_err(|error| {
                        CliError::Other(format!("failed to parse relay event: {error}"))
                    })
                })
                .collect::<Result<Vec<_>, _>>()?
                .iter()
                .map(CalendarSnapshot::from_event)
                .collect::<Result<Vec<_>, _>>()?;
            let from = from
                .parse::<i64>()
                .map_err(|error| CliError::Other(error.to_string()))?;
            let to = to
                .parse::<i64>()
                .map_err(|error| CliError::Other(error.to_string()))?;
            snapshots.retain(|snapshot| event_overlaps(snapshot, from, to));
            snapshots.sort_by(|a, b| a.start.cmp(&b.start).then_with(|| a.id.cmp(&b.id)));
            println!(
                "{}",
                serde_json::to_string_pretty(&snapshots)
                    .map_err(|e| CliError::Other(e.to_string()))?
            );
            Ok(())
        }
        CalendarCmd::Get { id, author } => {
            let author = resolve_read_author(client, &author)?;
            let event = fetch_by_author(client, &id, &author)
                .await?
                .ok_or_else(|| CliError::NotFound(format!("calendar event not found: {id}")))?;
            println!(
                "{}",
                serde_json::to_string_pretty(&CalendarSnapshot::from_event(&event)?)
                    .map_err(|e| CliError::Other(e.to_string()))?
            );
            Ok(())
        }
        CalendarCmd::Update {
            id,
            title,
            start,
            end,
            clear_end,
            timezone,
            description,
            clear_description,
            summary,
            clear_summary,
            locations,
            clear_locations,
            participants: participant_values,
            clear_participants,
            calendars,
            clear_calendars,
            expected_event,
        } => {
            let event = fetch_own(client, &id)
                .await?
                .ok_or_else(|| CliError::NotFound(format!("calendar event not found: {id}")))?;
            ensure_expected(&event, expected_event.as_deref())?;
            let mut input = CalendarSnapshot::from_event(&event)?.into_input();
            if let Some(title) = title {
                input.title = title;
            }
            if let Some(start) = start {
                input.start = start;
            }
            if clear_end {
                input.end = None;
            } else if end.is_some() {
                input.end = end;
            }
            let (start, end) = normalize_range(&input.start, input.end.as_deref(), input.all_day)?;
            input.start = start;
            input.end = end;
            validate_timezone(
                timezone.as_deref().or(input.start_tzid.as_deref()),
                input.all_day,
            )?;
            if let Some(timezone) = timezone {
                input.start_tzid = Some(timezone.clone());
                input.end_tzid = Some(timezone);
            }
            if input.all_day {
                input.start_tzid = None;
                input.end_tzid = None;
            }
            if clear_description {
                input.description.clear();
            } else if let Some(description) = description {
                input.description = description;
            }
            if clear_summary {
                input.summary = None;
            } else if summary.is_some() {
                input.summary = summary;
            }
            if clear_locations {
                input.locations.clear();
            } else if !locations.is_empty() {
                input.locations = locations;
            }
            if clear_participants {
                input.participants.clear();
            } else if !participant_values.is_empty() {
                input.participants = participants(participant_values);
            }
            if clear_calendars {
                input.calendar_ids.clear();
            } else if !calendars.is_empty() {
                input.calendar_ids = calendars;
            }
            let kind = if input.all_day {
                KIND_CALENDAR_DATE
            } else {
                KIND_CALENDAR_TIME
            };
            publish(
                client,
                build_calendar_event(&input).map_err(|e| CliError::Usage(e.to_string()))?,
                &id,
                kind,
            )
            .await
        }
        CalendarCmd::Delete { id, expected_event } => {
            let event = fetch_own(client, &id)
                .await?
                .ok_or_else(|| CliError::NotFound(format!("calendar event not found: {id}")))?;
            ensure_expected(&event, expected_event.as_deref())?;
            let kind = event.kind.as_u16();
            publish(
                client,
                build_delete_calendar_event(kind, &event.pubkey.to_hex(), &id)
                    .map_err(|e| CliError::Usage(e.to_string()))?,
                &id,
                kind,
            )
            .await
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_timed_range_to_unix_seconds() {
        let (start, end) = normalize_range(
            "2026-08-01T09:30:00+08:00",
            Some("2026-08-01T10:00:00+08:00"),
            false,
        )
        .unwrap();
        assert_eq!(start, "1785547800");
        assert_eq!(end.as_deref(), Some("1785549600"));
    }

    #[test]
    fn all_day_end_is_exclusive_and_later() {
        assert!(normalize_range("2026-08-01", Some("2026-08-02"), true).is_ok());
        assert!(normalize_range("2026-08-01", Some("2026-08-01"), true).is_err());
    }

    #[test]
    fn read_author_accepts_hex_shape_only() {
        let me = nostr::Keys::generate().public_key().to_hex();
        let owned_agent = nostr::Keys::generate().public_key().to_hex();
        assert_eq!(normalize_read_author("me", &me).unwrap(), me);
        assert_eq!(
            normalize_read_author(&owned_agent, &me).unwrap(),
            owned_agent
        );
        assert!(normalize_read_author("display name", &me).is_err());
    }

    #[test]
    fn overlap_uses_half_open_window_for_timed_and_all_day_events() {
        let snapshot = |start: &str, end: Option<&str>, all_day: bool| CalendarSnapshot {
            id: "id".into(),
            coordinate: "coord".into(),
            author: "author".into(),
            kind: if all_day {
                KIND_CALENDAR_DATE
            } else {
                KIND_CALENDAR_TIME
            },
            title: "title".into(),
            description: String::new(),
            start: start.into(),
            end: end.map(str::to_string),
            start_tzid: None,
            end_tzid: None,
            all_day,
            summary: None,
            locations: vec![],
            participants: vec![],
            calendar_ids: vec![],
            series: None,
            updated_at: 0,
            event_id: "event".into(),
        };
        assert!(event_overlaps(&snapshot("10", Some("20"), false), 15, 25));
        assert!(!event_overlaps(&snapshot("10", Some("20"), false), 20, 25));
        assert!(event_overlaps(
            &snapshot("1970-01-02", Some("1970-01-03"), true),
            86_400,
            172_800
        ));
    }

    #[test]
    fn weekday_rule_is_sorted_and_requires_first_day() {
        let monday = NaiveDate::from_ymd_opt(2026, 8, 3).unwrap();
        let parsed = parse_recurrence(
            None,
            Some("fri,mon,wed,mon".into()),
            None,
            Some(4),
            None,
            monday,
        )
        .unwrap();
        assert_eq!(
            parsed,
            Some((
                RecurrenceRule::Weekdays(vec![1, 3, 5]),
                RecurrenceEnd::Count(4)
            ))
        );
        assert!(parse_recurrence(None, Some("wed".into()), None, Some(2), None, monday,).is_err());
    }

    #[test]
    fn month_day_rule_skips_absent_dates() {
        let input = CalendarEventInput {
            id: "month-end".into(),
            title: "Close".into(),
            description: String::new(),
            start: "2027-01-31".into(),
            end: Some("2027-02-01".into()),
            all_day: true,
            start_tzid: None,
            end_tzid: None,
            summary: None,
            locations: vec![],
            participants: vec![],
            calendar_ids: vec![],
            series: None,
        };
        let events = expand_recurrence(
            input,
            RecurrenceRule::MonthDays(vec![31]),
            RecurrenceEnd::Count(3),
            None,
        )
        .unwrap();
        assert_eq!(
            events
                .iter()
                .map(|event| event.start.as_str())
                .collect::<Vec<_>>(),
            vec!["2027-01-31", "2027-03-31", "2027-05-31"]
        );
        assert_eq!(events[2].id, "month-end-2");
    }
}
