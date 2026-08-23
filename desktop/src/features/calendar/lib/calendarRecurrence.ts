import type {
  CalendarDraft,
  CalendarRecurrence,
  CalendarSeries,
} from "./calendarTypes";
import { addLocalDays, dateKey, parseDateKey } from "./calendarDateMath";

export const MAX_CALENDAR_OCCURRENCES = 365;

function canonicalValues(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function recurrenceMatches(
  date: Date,
  recurrence: CalendarRecurrence,
): boolean {
  if (recurrence.kind === "none" || recurrence.kind === "daily") return true;
  const values = canonicalValues(recurrence.values);
  return recurrence.kind === "weekdays"
    ? values.includes(date.getDay())
    : values.includes(date.getDate());
}

export function validateRecurrence(
  start: Date,
  recurrence: CalendarRecurrence,
): string | undefined {
  if (recurrence.kind === "none") return undefined;
  if (recurrence.kind !== "daily") {
    const values = canonicalValues(recurrence.values);
    const min = recurrence.kind === "weekdays" ? 0 : 1;
    const max = recurrence.kind === "weekdays" ? 6 : 31;
    if (!values.length || values.some((value) => value < min || value > max))
      return "Choose at least one valid repeat day.";
  }
  if (recurrence.end.kind === "count") {
    if (
      !Number.isInteger(recurrence.end.count) ||
      recurrence.end.count < 2 ||
      recurrence.end.count > MAX_CALENDAR_OCCURRENCES
    )
      return `Occurrences must be between 2 and ${MAX_CALENDAR_OCCURRENCES}.`;
  } else {
    const until = parseDateKey(recurrence.end.date);
    if (
      !until ||
      until < new Date(start.getFullYear(), start.getMonth(), start.getDate())
    )
      return "Repeat end date must not be before the first event.";
  }
  return undefined;
}

function seriesEnd(recurrence: Exclude<CalendarRecurrence, { kind: "none" }>) {
  return recurrence.end.kind === "count"
    ? `count:${recurrence.end.count}`
    : `until:${recurrence.end.date}`;
}

export function expandCalendarDraft(draft: CalendarDraft): CalendarDraft[] {
  const recurrence = draft.recurrence;
  if (recurrence.kind === "none") return [draft];
  const error = validateRecurrence(draft.start, recurrence);
  if (error) throw new Error(error);
  const countLimit =
    recurrence.end.kind === "count"
      ? recurrence.end.count
      : MAX_CALENDAR_OCCURRENCES;
  const until =
    recurrence.end.kind === "until"
      ? parseDateKey(recurrence.end.date)
      : undefined;
  const duration = draft.end.getTime() - draft.start.getTime();
  const allDayDuration = Math.max(1, Math.round(duration / 86_400_000));
  const values = canonicalValues(recurrence.values);
  const seriesId = draft.series?.id ?? draft.id;
  const results: CalendarDraft[] = [];
  let day = new Date(draft.start);
  for (
    let scanned = 0;
    results.length < countLimit && scanned < 3660;
    scanned += 1
  ) {
    const localDay = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    if (until && localDay > until) break;
    if (recurrenceMatches(day, recurrence)) {
      const occurrence = results.length;
      const start = new Date(day);
      const series: CalendarSeries = {
        id: seriesId,
        occurrence,
        repeat: recurrence.kind,
        values,
        end: seriesEnd(recurrence),
      };
      results.push({
        ...draft,
        id: `${seriesId}-${occurrence}`,
        start,
        end: draft.allDay
          ? addLocalDays(start, allDayDuration)
          : new Date(start.getTime() + duration),
        series,
      });
    }
    day = addLocalDays(day, 1);
    day.setHours(
      draft.start.getHours(),
      draft.start.getMinutes(),
      draft.start.getSeconds(),
      draft.start.getMilliseconds(),
    );
  }
  if (!results.length) throw new Error("The repeat rule creates no events.");
  return results;
}

export function recurrenceLabel(series: CalendarSeries): string {
  if (series.repeat === "daily") return "Daily";
  if (series.repeat === "weekdays") {
    const names = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    return `Every ${series.values.map((value) => names[value]).join(", ")}`;
  }
  return `Monthly on ${series.values.join(", ")}`;
}

export function recurrenceUntilDefault(start: Date): string {
  return dateKey(addLocalDays(start, 30));
}
