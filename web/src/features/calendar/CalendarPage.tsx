import { CalendarDays, ChevronLeft, ChevronRight, Circle } from "lucide-react";
import { useMemo, useState } from "react";
import { useWorkConsoleData } from "@/shared/hooks/useWorkConsoleData";
import { AsyncStateView } from "@/shared/ui/AsyncStateView";
import { DesktopParityAppShell } from "@/shared/ui/DesktopParityAppShell";

type View = "day" | "week" | "month";
export function CalendarPage() {
  const { state, refresh } = useWorkConsoleData();
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState<string>();
  const days = useMemo(() => calendarDays(anchor, view), [anchor, view]);
  const title = anchor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    ...(view === "day" ? { day: "numeric" } : {}),
  });
  const move = (direction: number) =>
    setAnchor((current) => {
      const next = new Date(current);
      if (view === "month") next.setMonth(next.getMonth() + direction);
      else next.setDate(next.getDate() + direction * (view === "week" ? 7 : 1));
      return next;
    });
  return (
    <DesktopParityAppShell>
      {state.status !== "ready" ? (
        <AsyncStateView
          status={state.status}
          message={state.status === "error" ? state.message : undefined}
          onRetry={refresh}
        />
      ) : (
        <div
          className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
          data-testid="calendar-screen"
        >
          <aside className="w-56 shrink-0 border-r border-border p-4 max-[820px]:hidden">
            <div className="mb-5 flex items-center gap-2">
              <CalendarDays className="size-4" />
              <h2 className="text-sm font-semibold">Calendars</h2>
            </div>
            <div className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted">
              <Circle className="size-3 fill-primary text-primary" />
              Personal
            </div>
            <div className="mt-6">
              <p className="px-2 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                Shared
              </p>
              <div className="mt-2 flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted">
                <Circle className="size-3 fill-blue-500 text-blue-500" />
                Agent calendars
              </div>
            </div>
            <div className="mt-8 rounded-xl border border-border p-3">
              <p className="text-xs font-medium">Read only on Web</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Ask an Agent or use Desktop to create and edit events.
              </p>
            </div>
          </aside>
          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
              <button
                className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                onClick={() => setAnchor(new Date())}
                type="button"
              >
                Today
              </button>
              <button
                className="rounded-md p-1.5 hover:bg-muted"
                onClick={() => move(-1)}
                type="button"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                className="rounded-md p-1.5 hover:bg-muted"
                onClick={() => move(1)}
                type="button"
              >
                <ChevronRight className="size-4" />
              </button>
              <h1 className="ml-2 text-base font-semibold">{title}</h1>
              <div className="ml-auto flex rounded-lg bg-muted p-0.5">
                {(["day", "week", "month"] as const).map((item) => (
                  <button
                    className={`rounded-md px-3 py-1.5 text-xs capitalize ${view === item ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                    key={item}
                    onClick={() => setView(item)}
                    type="button"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-auto">
              {view === "month" ? (
                <MonthGrid
                  days={days}
                  events={state.data.calendar}
                  onSelect={setSelected}
                />
              ) : (
                <TimeGrid
                  days={days}
                  events={state.data.calendar}
                  onSelect={setSelected}
                />
              )}
            </div>
          </main>
          {selected && (
            <EventDetail
              event={state.data.calendar.find((item) => item.id === selected)}
              onClose={() => setSelected(undefined)}
            />
          )}
        </div>
      )}
    </DesktopParityAppShell>
  );
}

function TimeGrid({
  days,
  events,
  onSelect,
}: {
  days: Date[];
  events: import("./types").CalendarItem[];
  onSelect: (id: string) => void;
}) {
  return (
    <div
      className="grid min-w-[680px]"
      style={{
        gridTemplateColumns: `64px repeat(${days.length}, minmax(120px, 1fr))`,
      }}
    >
      <div className="sticky top-0 z-10 border-b border-r bg-background" />
      {days.map((day) => (
        <div
          className="sticky top-0 z-10 border-b border-r bg-background py-2 text-center"
          key={day.toISOString()}
        >
          <p className="text-2xs uppercase text-muted-foreground">
            {day.toLocaleDateString(undefined, { weekday: "short" })}
          </p>
          <p className="mt-1 text-lg font-semibold">{day.getDate()}</p>
        </div>
      ))}
      {Array.from({ length: 12 }, (_, hour) => hour + 8).flatMap((hour) => [
        <div
          className="h-16 border-b border-r pr-2 pt-1 text-right text-2xs text-muted-foreground"
          key={`label-${hour}`}
        >
          {String(hour).padStart(2, "0")}:00
        </div>,
        ...days.map((day) => (
          <div
            className="relative h-16 border-b border-r"
            key={`${day.toISOString()}-${hour}`}
          >
            {events
              .filter(
                (event) =>
                  sameDay(event.start, day) && event.start.getHours() === hour,
              )
              .map((event) => (
                <button
                  className="absolute inset-x-1 top-1 z-[1] rounded-md border-l-2 border-primary bg-primary/10 px-2 py-1 text-left text-xs text-primary hover:bg-primary/15"
                  key={event.id}
                  onClick={() => onSelect(event.id)}
                  type="button"
                >
                  {event.title}
                </button>
              ))}
          </div>
        )),
      ])}
    </div>
  );
}
function MonthGrid({
  days,
  events,
  onSelect,
}: {
  days: Date[];
  events: import("./types").CalendarItem[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid min-h-full grid-cols-7">
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
        <div
          className="border-b border-r p-2 text-center text-2xs font-medium text-muted-foreground"
          key={label}
        >
          {label}
        </div>
      ))}
      {days.map((day) => (
        <div className="min-h-28 border-b border-r p-2" key={day.toISOString()}>
          <span className="text-xs">{day.getDate()}</span>
          <div className="mt-2 space-y-1">
            {events
              .filter((event) => sameDay(event.start, day))
              .map((event) => (
                <button
                  className="block w-full truncate rounded bg-primary/10 px-1.5 py-1 text-left text-2xs text-primary"
                  key={event.id}
                  onClick={() => onSelect(event.id)}
                  type="button"
                >
                  {event.title}
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
function EventDetail({
  event,
  onClose,
}: {
  event?: import("./types").CalendarItem;
  onClose: () => void;
}) {
  if (!event) return null;
  return (
    <aside className="absolute right-4 top-16 z-20 w-80 rounded-xl border border-border bg-popover p-4 shadow-xl">
      <button
        className="float-right text-xs text-muted-foreground"
        onClick={onClose}
        type="button"
      >
        Close
      </button>
      <h2 className="pr-10 text-base font-semibold">{event.title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {event.start.toLocaleString()}
      </p>
      {event.location && <p className="mt-2 text-sm">{event.location}</p>}
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6">
        {event.description}
      </p>
    </aside>
  );
}
function sameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
function calendarDays(anchor: Date, view: View) {
  if (view === "day") return [new Date(anchor)];
  if (view === "week") {
    const start = new Date(anchor);
    start.setDate(anchor.getDate() - anchor.getDay());
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}
