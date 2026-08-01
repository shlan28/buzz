export type CalendarView = "day" | "week" | "month";

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
};

export type CalendarDraft = Omit<
  CalendarEvent,
  "eventId" | "author" | "kind" | "createdAt"
> & { eventId?: string; author?: string };

export type CalendarRange = { start: Date; end: Date };
