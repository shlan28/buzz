import { ChevronRight, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useWorkConsoleData } from "@/shared/hooks/useWorkConsoleData";
import { AsyncStateView } from "@/shared/ui/AsyncStateView";
import { DesktopParityAppShell } from "@/shared/ui/DesktopParityAppShell";
import type { Track } from "./types";
export function TracksPage() {
  const { state, refresh } = useWorkConsoleData();
  const [scope, setScope] = useState<"current" | "completed" | "archived">(
    "current",
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>();
  const visible = useMemo(
    () =>
      state.status === "ready"
        ? state.data.tracks.filter(
            (track) =>
              (scope === "archived"
                ? track.archived
                : !track.archived &&
                  (scope === "completed"
                    ? track.status === "completed"
                    : track.status !== "completed")) &&
              `${track.name} ${track.description}`
                .toLowerCase()
                .includes(query.toLowerCase()),
          )
        : [],
    [query, scope, state],
  );
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
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
          data-testid="tracks-screen"
        >
          <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
            <div className="mr-auto">
              <h1 className="text-lg font-semibold tracking-tight">Tracks</h1>
              <p className="text-xs text-muted-foreground">
                Coordinate owned work across a planned timeline.
              </p>
            </div>
            <div className="relative min-w-52 flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="h-9 w-full rounded-md border border-input bg-transparent pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tracks…"
                value={query}
              />
            </div>
            <span className="rounded-full bg-muted px-2 py-1 text-2xs text-muted-foreground">
              Read only
            </span>
          </header>
          <div className="flex items-center gap-3 px-5 py-3">
            <div className="flex rounded-lg bg-muted p-0.5">
              {(["current", "completed", "archived"] as const).map((item) => (
                <button
                  className={`rounded-md px-3 py-1.5 text-xs capitalize ${scope === item ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                  key={item}
                  onClick={() => setScope(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {visible.length} {visible.length === 1 ? "track" : "tracks"}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {visible.map((track) => {
                const tasks = state.data.tasks.filter(
                  (task) => task.trackId === track.id,
                );
                const done = tasks.filter(
                  (task) => task.status === "done",
                ).length;
                const percent = tasks.length
                  ? Math.round((done / tasks.length) * 100)
                  : 0;
                return (
                  <button
                    className="flex w-full items-center gap-4 border-b p-4 text-left last:border-0 hover:bg-muted/40"
                    key={track.id}
                    onClick={() => setSelected(track.id)}
                    type="button"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-sm font-semibold">
                          {track.name}
                        </h2>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-2xs capitalize text-muted-foreground">
                          {track.status}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                        {track.description}
                      </p>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="text-2xs tabular-nums text-muted-foreground">
                          {done}/{tasks.length}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                );
              })}
              {!visible.length && (
                <div className="grid min-h-56 place-items-center text-sm text-muted-foreground">
                  No tracks in this view.
                </div>
              )}
            </div>
          </div>
          {selected && (
            <TrackDetail
              track={state.data.tracks.find((track) => track.id === selected)}
              onClose={() => setSelected(undefined)}
            />
          )}
        </div>
      )}
    </DesktopParityAppShell>
  );
}
function TrackDetail({
  onClose,
  track,
}: {
  onClose: () => void;
  track?: Track;
}) {
  if (!track) return null;
  return (
    <aside className="absolute inset-y-0 right-0 z-20 w-[400px] border-l border-border bg-background p-5 shadow-xl max-[700px]:w-full">
      <button
        className="float-right rounded-md p-1 hover:bg-muted"
        onClick={onClose}
        type="button"
      >
        <X className="size-4" />
      </button>
      <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
        Track
      </p>
      <h2 className="mt-2 pr-8 text-xl font-semibold">{track.name}</h2>
      <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
        {track.description || "No description."}
      </p>
      <dl className="mt-6 grid grid-cols-[100px_1fr] gap-y-3 text-sm">
        <dt className="text-muted-foreground">Status</dt>
        <dd className="capitalize">{track.status}</dd>
        <dt className="text-muted-foreground">Owner</dt>
        <dd className="truncate">{track.owner ?? "Unassigned"}</dd>
        <dt className="text-muted-foreground">Timeline</dt>
        <dd>
          {track.startDate ?? "—"} – {track.endDate ?? "—"}
        </dd>
      </dl>
    </aside>
  );
}
