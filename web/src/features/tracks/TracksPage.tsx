import { Waypoints } from "lucide-react";
import { useWorkConsoleData } from "@/shared/hooks/useWorkConsoleData";
import { AsyncStateView } from "@/shared/ui/AsyncStateView";
import { DesktopParityAppShell } from "@/shared/ui/DesktopParityAppShell";
export function TracksPage() {
  const { state, refresh } = useWorkConsoleData();
  return (
    <DesktopParityAppShell>
      {state.status !== "ready" ? (
        <AsyncStateView
          status={state.status}
          message={state.status === "error" ? state.message : undefined}
          onRetry={refresh}
        />
      ) : (
        <>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-4">
            <Waypoints className="size-4 text-muted-foreground" />
            <h1 className="text-sm font-semibold">Tracks</h1>
            <span className="ml-auto text-2xs text-muted-foreground">
              Read only
            </span>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {state.data.tracks.map((track) => {
                const tasks = state.data.tasks.filter(
                  (task) => task.trackId === track.id,
                );
                const done = tasks.filter(
                  (task) => task.status === "done",
                ).length;
                const progress = tasks.length
                  ? Math.round((done / tasks.length) * 100)
                  : 0;
                return (
                  <article
                    className="rounded-xl border border-border bg-card p-4"
                    key={track.id}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-sm font-semibold">{track.name}</h2>
                      <span className="rounded bg-muted px-2 py-0.5 text-2xs capitalize">
                        {track.status}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {track.description || "No description"}
                    </p>
                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="mt-2 flex justify-between text-2xs text-muted-foreground">
                      <span>{tasks.length} tasks</span>
                      <span>{progress}%</span>
                    </div>
                  </article>
                );
              })}
            </div>
            {!state.data.tracks.length && (
              <p className="py-20 text-center text-sm text-muted-foreground">
                No tracks.
              </p>
            )}
          </div>
        </>
      )}
    </DesktopParityAppShell>
  );
}
