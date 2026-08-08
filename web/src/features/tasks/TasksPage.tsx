import { CheckSquare2 } from "lucide-react";
import { useWorkConsoleData } from "@/shared/hooks/useWorkConsoleData";
import { AsyncStateView } from "@/shared/ui/AsyncStateView";
import { DesktopParityAppShell } from "@/shared/ui/DesktopParityAppShell";
const columns = ["backlog", "todo", "in-progress", "blocked", "done"] as const;
export function TasksPage() {
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
            <CheckSquare2 className="size-4 text-muted-foreground" />
            <h1 className="text-sm font-semibold">Tasks</h1>
            <span className="ml-auto text-2xs text-muted-foreground">
              Read only · {state.data.tasks.length}
            </span>
          </header>
          <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
            {columns.map((status) => (
              <section className="w-64 shrink-0" key={status}>
                <h2 className="mb-2 flex items-center justify-between text-xs font-semibold capitalize text-muted-foreground">
                  <span>{status.replace("-", " ")}</span>
                  <span>
                    {
                      state.data.tasks.filter((task) => task.status === status)
                        .length
                    }
                  </span>
                </h2>
                <div className="space-y-2">
                  {state.data.tasks
                    .filter((task) => task.status === status)
                    .map((task) => (
                      <article
                        className="rounded-lg border border-border bg-card p-3 shadow-sm"
                        key={task.id}
                      >
                        <h3 className="text-sm font-medium">{task.title}</h3>
                        {task.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {task.description}
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-1">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-2xs">
                            {task.priority}
                          </span>
                          {task.due && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-2xs">
                              {task.due.toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </article>
                    ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </DesktopParityAppShell>
  );
}
