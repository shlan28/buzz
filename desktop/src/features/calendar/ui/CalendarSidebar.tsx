import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  addLocalDays,
  dateKey,
  startOfMonth,
  startOfWeek,
} from "../lib/calendarDateMath";

export function CalendarSidebar({
  date,
  onSelectDate,
}: {
  date: Date;
  onSelectDate: (date: Date) => void;
}) {
  const monthStart = startOfMonth(date);
  const gridStart = startOfWeek(monthStart);
  const days = Array.from({ length: 42 }, (_, index) =>
    addLocalDays(gridStart, index),
  );
  return (
    <aside
      className="hidden w-64 shrink-0 border-r border-border/60 bg-sidebar/40 p-4 lg:block"
      data-testid="calendar-sidebar"
    >
      <div className="mb-3 flex items-center justify-between">
        <strong className="text-sm">
          {new Intl.DateTimeFormat(undefined, {
            month: "long",
            year: "numeric",
          }).format(date)}
        </strong>
        <div className="flex">
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Previous month"
            onClick={() =>
              onSelectDate(new Date(date.getFullYear(), date.getMonth() - 1, 1))
            }
          >
            <ChevronLeft />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Next month"
            onClick={() =>
              onSelectDate(new Date(date.getFullYear(), date.getMonth() + 1, 1))
            }
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
          <span key={label} className="py-1" title={label}>
            {label.slice(0, 1)}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => (
          <button
            key={dateKey(day)}
            type="button"
            aria-label={dateKey(day)}
            onClick={() => onSelectDate(day)}
            className={`aspect-square rounded-full text-xs hover:bg-accent ${day.getMonth() !== date.getMonth() ? "text-muted-foreground/50" : ""} ${dateKey(day) === dateKey(date) ? "bg-primary text-primary-foreground" : ""}`}
          >
            {day.getDate()}
          </button>
        ))}
      </div>
      <div className="mt-6 border-t border-border/60 pt-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          My calendars
        </h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" defaultChecked className="accent-primary" />
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          Personal
        </label>
      </div>
    </aside>
  );
}
