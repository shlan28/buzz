import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";
import { formatRange } from "../lib/calendarDateMath";
import type { CalendarView } from "../lib/calendarTypes";

export function CalendarToolbar({
  date,
  view,
  onDateChange,
  onViewChange,
  onCreate,
}: {
  date: Date;
  view: CalendarView;
  onDateChange: (direction: -1 | 0 | 1) => void;
  onViewChange: (view: CalendarView) => void;
  onCreate: () => void;
}) {
  return (
    <header
      className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3"
      data-testid="calendar-toolbar"
    >
      <Button variant="outline" onClick={() => onDateChange(0)}>
        Today
      </Button>
      <Button
        aria-label="Previous period"
        size="icon"
        variant="ghost"
        onClick={() => onDateChange(-1)}
      >
        <ChevronLeft />
      </Button>
      <Button
        aria-label="Next period"
        size="icon"
        variant="ghost"
        onClick={() => onDateChange(1)}
      >
        <ChevronRight />
      </Button>
      <h1
        className="min-w-0 flex-1 truncate px-2 text-lg font-semibold"
        data-testid="calendar-range-title"
      >
        {formatRange(date, view)}
      </h1>
      <div
        className="flex rounded-lg bg-muted p-1"
        role="tablist"
        aria-label="Calendar view"
      >
        {(["day", "week", "month"] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={view === item}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm capitalize",
              view === item && "bg-background text-foreground shadow-sm",
            )}
            onClick={() => onViewChange(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <Button onClick={onCreate}>
        <Plus />
        Create event
      </Button>
    </header>
  );
}
