import * as React from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  getCalendarRange,
  moveCalendarDate,
  parseDateKey,
  dateKey,
  addLocalDays,
} from "../lib/calendarDateMath";
import type {
  CalendarDraft,
  CalendarEvent,
  CalendarView,
} from "../lib/calendarTypes";
import { useCalendar } from "../hooks";
import { CalendarToolbar } from "./CalendarToolbar";
import { CalendarSidebar } from "./CalendarSidebar";
import { CalendarGrid } from "./CalendarGrid";
import { CalendarMonthView } from "./CalendarMonthView";
import { CalendarEventDialog } from "./CalendarEventDialog";
import { CalendarEventPopover } from "./CalendarEventPopover";

function defaultDraft(date: Date, allDay = false): CalendarDraft {
  const start = allDay
    ? new Date(date.getFullYear(), date.getMonth(), date.getDate())
    : new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        Math.max(9, new Date().getHours()),
        0,
      );
  return {
    id: crypto.randomUUID(),
    title: "",
    description: "",
    location: "",
    participants: [],
    calendarId: "personal",
    start,
    end: allDay
      ? addLocalDays(start, 1)
      : new Date(start.getTime() + 1_800_000),
    allDay,
    recurrence: { kind: "none" },
  };
}

export function CalendarScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const search = location.search as { date?: string; view?: CalendarView };
  const view: CalendarView = search.view ?? "week";
  const date = parseDateKey(search.date) ?? new Date();
  const range = React.useMemo(() => getCalendarRange(date, view), [date, view]);
  const calendar = useCalendar(range);
  const [draft, setDraft] = React.useState<CalendarDraft | null>(null);
  const [selected, setSelected] = React.useState<CalendarEvent | null>(null);
  const [saveError, setSaveError] = React.useState<string>();
  const [deleteError, setDeleteError] = React.useState<string>();
  const gridScrollTopRef = React.useRef<number | null>(null);
  const setRoute = (nextDate: Date, nextView: CalendarView = view) =>
    void navigate({
      search: { date: dateKey(nextDate), view: nextView },
      replace: true,
    } as never);
  const openCreate = (next: CalendarDraft) => {
    setSelected(null);
    setSaveError(undefined);
    setDraft(next);
  };
  const editSelected = () => {
    if (!selected) return;
    setDraft({ ...selected, recurrence: { kind: "none" } });
    setSelected(null);
  };
  const openSelected = (event: CalendarEvent) => {
    setDeleteError(undefined);
    setSelected(event);
  };
  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
      data-testid="calendar-screen"
    >
      <CalendarSidebar
        date={date}
        onSelectDate={(next) => setRoute(next)}
        sources={calendar.sources}
        sourcesLoading={calendar.sourcesLoading}
        onToggleSource={calendar.toggleSource}
        onRetrySource={(sourcePubkey) => {
          void calendar.retrySource(sourcePubkey);
        }}
      />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <CalendarToolbar
          date={date}
          view={view}
          onDateChange={(direction) =>
            setRoute(
              direction === 0
                ? new Date()
                : moveCalendarDate(date, view, direction),
            )
          }
          onViewChange={(next) => setRoute(date, next)}
          onCreate={() => openCreate(defaultDraft(date))}
        />
        {calendar.isLoading ? (
          <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
            Loading calendar…
          </div>
        ) : null}
        {calendar.isError ? (
          <div
            className="grid flex-1 place-items-center px-6 text-center"
            data-testid="calendar-load-error"
          >
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Calendar couldn&apos;t be loaded
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  The relay rejected or interrupted the calendar request.
                </p>
              </div>
              <button
                className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                disabled={calendar.isFetching}
                onClick={() => void calendar.refetch()}
                type="button"
              >
                {calendar.isFetching ? "Retrying…" : "Retry"}
              </button>
            </div>
          </div>
        ) : null}
        {!calendar.isLoading && !calendar.isError && view === "month" ? (
          <CalendarMonthView
            date={date}
            events={calendar.events}
            onCreate={(day) => openCreate(defaultDraft(day, true))}
            onOpen={openSelected}
          />
        ) : null}
        {!calendar.isLoading && !calendar.isError && view !== "month" ? (
          <CalendarGrid
            date={date}
            view={view}
            events={calendar.events}
            draft={draft}
            onDraft={openCreate}
            onOpen={openSelected}
            currentPubkey={calendar.pubkey}
            scrollTopRef={gridScrollTopRef}
            authorLabels={calendar.authorLabels}
          />
        ) : null}
      </main>
      <CalendarEventDialog
        draft={draft}
        open={Boolean(draft)}
        pending={calendar.save.isPending}
        error={saveError}
        onChange={setDraft}
        onClose={() => {
          if (!calendar.save.isPending) setDraft(null);
        }}
        onSave={() => {
          if (!draft) return;
          setSaveError(undefined);
          calendar.save.mutate(draft, {
            onSuccess: () => setDraft(null),
            onError: (error) =>
              setSaveError(
                error instanceof Error
                  ? error.message
                  : "Could not save event.",
              ),
          });
        }}
      />
      <CalendarEventPopover
        event={selected}
        currentPubkey={calendar.pubkey}
        authorLabel={
          selected ? calendar.authorLabels[selected.author] : undefined
        }
        deletePending={calendar.remove.isPending}
        deleteError={deleteError}
        onClose={() => {
          if (calendar.remove.isPending) return;
          setDeleteError(undefined);
          setSelected(null);
        }}
        onEdit={editSelected}
        onDelete={() => {
          if (!selected) return;
          setDeleteError(undefined);
          calendar.remove.mutate(selected, {
            onSuccess: () => setSelected(null),
            onError: (error) =>
              setDeleteError(
                error instanceof Error
                  ? error.message
                  : "Could not delete event.",
              ),
          });
        }}
      />
    </div>
  );
}
