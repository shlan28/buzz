export type CalendarView = "day" | "week" | "month";

export type CalendarRecurrence =
  | { kind: "none" }
  | {
      kind: "daily" | "weekdays" | "month-days";
      values: number[];
      end: { kind: "count"; count: number } | { kind: "until"; date: string };
    };

export type CalendarSeries = {
  id: string;
  occurrence: number;
  repeat: "daily" | "weekdays" | "month-days";
  values: number[];
  end: string;
};

export type CalendarEvent = {
  id: string;
  eventId: string;
  author: string;
  title: string;
  description: string;
  location: string;
  participants: string[];
  calendarId: string;
  start: Date;
  end: Date;
  allDay: boolean;
  kind: 31922 | 31923;
  createdAt: number;
  series?: CalendarSeries;
};

export type CalendarDraft = Omit<
  CalendarEvent,
  "eventId" | "author" | "kind" | "createdAt"
> & {
  eventId?: string;
  author?: string;
  recurrence: CalendarRecurrence;
};

export type CalendarRange = { start: Date; end: Date };

export type CalendarSource = {
  pubkey: string;
  label: string;
  kind: "personal" | "agent";
  enabled: boolean;
  status: "idle" | "loading" | "ready" | "error";
};
