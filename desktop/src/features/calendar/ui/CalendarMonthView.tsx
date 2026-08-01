import {
  addLocalDays,
  dateKey,
  getCalendarRange,
} from "../lib/calendarDateMath";
import type { CalendarEvent } from "../lib/calendarTypes";

export function CalendarMonthView({
  date,
  events,
  onCreate,
  onOpen,
}: {
  date: Date;
  events: CalendarEvent[];
  onCreate: (date: Date) => void;
  onOpen: (event: CalendarEvent) => void;
}) {
  const start = getCalendarRange(date, "month").start;
  return (
    <div
      className="grid min-h-0 flex-1 grid-cols-7 grid-rows-[auto_repeat(6,minmax(5rem,1fr))] overflow-auto"
      data-testid="calendar-month-view"
    >
      {[
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ].map((day) => (
        <div
          key={day}
          className="border-b border-r border-border/60 p-2 text-xs font-medium text-muted-foreground"
        >
          {day}
        </div>
      ))}
      {Array.from({ length: 42 }, (_, index) => addLocalDays(start, index)).map(
        (day) => {
          const dayEvents = events.filter(
            (event) => dateKey(event.start) === dateKey(day),
          );
          return (
            <div
              key={dateKey(day)}
              className="min-h-20 border-b border-r border-border/60 p-1.5 text-left align-top hover:bg-muted/40"
            >
              <button
                type="button"
                onClick={() => onCreate(day)}
                className={`text-xs ${day.getMonth() === date.getMonth() ? "" : "text-muted-foreground/50"}`}
              >
                {day.getDate()}
              </button>
              <span className="mt-1 flex flex-col gap-1">
                {dayEvents.slice(0, 3).map((event) => (
                  <button
                    type="button"
                    key={event.eventId}
                    onClick={(click) => {
                      click.stopPropagation();
                      onOpen(event);
                    }}
                    className="truncate rounded bg-primary/15 px-1.5 py-1 text-xs text-primary"
                  >
                    {event.title}
                  </button>
                ))}
              </span>
            </div>
          );
        },
      )}
    </div>
  );
}
