import * as React from "react";
import { addLocalDays, dateKey, startOfWeek } from "../lib/calendarDateMath";
import type {
  CalendarDraft,
  CalendarEvent,
  CalendarView,
} from "../lib/calendarTypes";

const START_HOUR = 7;
const END_HOUR = 22;
const HOUR_HEIGHT = 64;

function atMinute(day: Date, minute: number) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minute);
}

export function CalendarGrid({
  date,
  view,
  events,
  draft,
  onDraft,
  onOpen,
}: {
  date: Date;
  view: Exclude<CalendarView, "month">;
  events: CalendarEvent[];
  draft: CalendarDraft | null;
  onDraft: (draft: CalendarDraft) => void;
  onOpen: (event: CalendarEvent) => void;
}) {
  const days =
    view === "day"
      ? [date]
      : Array.from({ length: 7 }, (_, index) =>
          addLocalDays(startOfWeek(date), index),
        );
  const drag = React.useRef<{ day: Date; startMinute: number } | null>(null);
  const minuteFromPointer = (element: HTMLElement, clientY: number) => {
    const y = Math.max(
      0,
      Math.min(
        element.getBoundingClientRect().height,
        clientY - element.getBoundingClientRect().top,
      ),
    );
    return START_HOUR * 60 + Math.round((y / HOUR_HEIGHT) * 4) * 15;
  };
  const create = (day: Date, startMinute: number, endMinute: number) =>
    onDraft({
      id: crypto.randomUUID(),
      title: "",
      description: "",
      location: "",
      participants: [],
      calendarId: "personal",
      start: atMinute(day, Math.min(startMinute, endMinute)),
      end: atMinute(day, Math.max(startMinute + 30, endMinute)),
      allDay: false,
    });
  const visible = events.filter((event) => !event.allDay);
  return (
    <div
      className="min-h-0 flex-1 overflow-auto"
      data-testid={`calendar-${view}-view`}
    >
      <div
        className="sticky top-0 z-20 ml-14 grid border-b border-border/60 bg-background"
        style={{
          gridTemplateColumns: `repeat(${days.length}, minmax(8rem, 1fr))`,
        }}
      >
        {days.map((day) => (
          <button
            key={dateKey(day)}
            type="button"
            className="border-r border-border/60 px-2 py-2 text-center hover:bg-muted/50"
          >
            <span className="block text-xs text-muted-foreground">
              {new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(
                day,
              )}
            </span>
            <span className="text-lg font-semibold">{day.getDate()}</span>
          </button>
        ))}
      </div>
      <div
        className="relative flex"
        style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT }}
      >
        <div className="w-14 shrink-0">
          {Array.from(
            { length: END_HOUR - START_HOUR },
            (_, index) => index + START_HOUR,
          ).map((hour) => (
            <div
              key={`hour-${hour}`}
              className="h-16 pr-2 text-right text-xs text-muted-foreground"
            >
              {String(hour).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        <div
          className="grid min-w-0 flex-1"
          style={{
            gridTemplateColumns: `repeat(${days.length}, minmax(8rem, 1fr))`,
          }}
        >
          {days.map((day) => (
            <div
              key={dateKey(day)}
              data-testid={`calendar-day-column-${dateKey(day)}`}
              className="relative border-r border-border/60 bg-[linear-gradient(to_bottom,hsl(var(--border)/.5)_1px,transparent_1px)] bg-size-[100%_2rem]"
              onPointerDown={(event) => {
                if (
                  (event.target as HTMLElement).closest("[data-calendar-event]")
                )
                  return;
                const startMinute = minuteFromPointer(
                  event.currentTarget,
                  event.clientY,
                );
                drag.current = { day, startMinute };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerUp={(event) => {
                const active = drag.current;
                drag.current = null;
                if (!active) return;
                create(
                  active.day,
                  active.startMinute,
                  minuteFromPointer(event.currentTarget, event.clientY),
                );
              }}
            >
              {[
                ...visible,
                ...(draft && !draft.allDay
                  ? [
                      {
                        ...draft,
                        eventId: "draft",
                        author: "",
                        kind: 31923 as const,
                        createdAt: 0,
                      },
                    ]
                  : []),
              ]
                .filter((item) => dateKey(item.start) === dateKey(day))
                .map((item) => {
                  const top =
                    ((item.start.getHours() * 60 +
                      item.start.getMinutes() -
                      START_HOUR * 60) /
                      60) *
                    HOUR_HEIGHT;
                  const height = Math.max(
                    24,
                    ((item.end.getTime() - item.start.getTime()) / 3_600_000) *
                      HOUR_HEIGHT,
                  );
                  return (
                    <button
                      key={item.eventId}
                      type="button"
                      data-calendar-event
                      data-testid={
                        item.eventId === "draft"
                          ? "calendar-draft-block"
                          : `calendar-event-${item.id}`
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        if (item.eventId !== "draft")
                          onOpen(item as CalendarEvent);
                      }}
                      className={`absolute inset-x-1 z-10 overflow-hidden rounded-md border-l-4 border-primary bg-primary/15 px-2 py-1 text-left text-xs text-primary ${item.eventId === "draft" ? "border-dashed opacity-70" : ""}`}
                      style={{ top, height }}
                    >
                      <strong className="block truncate">
                        {item.title || "New event"}
                      </strong>
                      <span>
                        {new Intl.DateTimeFormat(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        }).format(item.start)}
                      </span>
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
