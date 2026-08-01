import type { CalendarRange, CalendarView } from "./calendarTypes";

export const SLOT_MINUTES = 15;
export const DEFAULT_EVENT_MINUTES = 30;

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function startOfWeek(date: Date): Date {
  const day = startOfLocalDay(date);
  const mondayOffset = (day.getDay() + 6) % 7;
  return addLocalDays(day, -mondayOffset);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function getCalendarRange(
  date: Date,
  view: CalendarView,
): CalendarRange {
  if (view === "day") {
    const start = startOfLocalDay(date);
    return { start, end: addLocalDays(start, 1) };
  }
  if (view === "week") {
    const start = startOfWeek(date);
    return { start, end: addLocalDays(start, 7) };
  }
  const start = startOfWeek(startOfMonth(date));
  return { start, end: addLocalDays(start, 42) };
}

export function moveCalendarDate(
  date: Date,
  view: CalendarView,
  amount: number,
): Date {
  if (view === "month") {
    return new Date(date.getFullYear(), date.getMonth() + amount, 1);
  }
  return addLocalDays(date, amount * (view === "week" ? 7 : 1));
}

export function snapMinutes(minutes: number): number {
  return Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return dateKey(parsed) === value ? parsed : null;
}

export function formatRange(date: Date, view: CalendarView): string {
  if (view === "day") {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date);
  }
  if (view === "month") {
    return new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric",
    }).format(date);
  }
  const { start, end } = getCalendarRange(date, view);
  const last = addLocalDays(end, -1);
  return `${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(start)} – ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(last)}`;
}
