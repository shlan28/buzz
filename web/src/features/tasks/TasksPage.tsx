import { LayoutGrid, List, Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useWorkConsoleData } from "@/shared/hooks/useWorkConsoleData";
import { AsyncStateView } from "@/shared/ui/AsyncStateView";
import { DesktopParityAppShell } from "@/shared/ui/DesktopParityAppShell";
import type { Task, TaskStatus } from "./types";

const statuses: TaskStatus[] = [
  "backlog",
  "todo",
  "in-progress",
  "blocked",
  "done",
];
export function TasksPage() {
  const { state, refresh } = useWorkConsoleData();
  const [view, setView] = useState<"board" | "list">("board");
  const [query, setQuery] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [selected, setSelected] = useState<string>();
  const visible = useMemo(
    () =>
      state.status === "ready"
        ? state.data.tasks.filter(
            (task) =>
              (showDone || task.status !== "done") &&
              `${task.title} ${task.description}`
                .toLowerCase()
                .includes(query.toLowerCase()),
          )
        : [],
    [query, showDone, state],
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
          data-testid="tasks-screen"
        >
          <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
            <div className="mr-auto">
              <h1 className="text-lg font-semibold tracking-tight">Tasks</h1>
              <p className="text-xs text-muted-foreground">
                Work grouped by status
              </p>
            </div>
            <div className="relative min-w-52 flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="h-9 w-full rounded-md border border-input bg-transparent pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tasks…"
                value={query}
              />
            </div>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm hover:bg-muted"
              onClick={() => setShowDone((value) => !value)}
              type="button"
            >
              <SlidersHorizontal className="size-4" />
              {showDone ? "Hide done" : "Show done"}
            </button>
            <div className="flex rounded-lg bg-muted p-0.5">
              <button
                aria-label="Board view"
                className={`rounded-md p-2 ${view === "board" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                onClick={() => setView("board")}
                type="button"
              >
                <LayoutGrid className="size-4" />
              </button>
              <button
                aria-label="List view"
                className={`rounded-md p-2 ${view === "list" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                onClick={() => setView("list")}
                type="button"
              >
                <List className="size-4" />
              </button>
            </div>
            <span className="rounded-full bg-muted px-2 py-1 text-2xs text-muted-foreground">
              Read only
            </span>
          </header>
          {view === "board" ? (
            <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
              {statuses
                .filter((status) => showDone || status !== "done")
                .map((status) => (
                  <section className="w-72 shrink-0" key={status}>
                    <h2 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold capitalize text-muted-foreground">
                      <span>{status.replace("-", " ")}</span>
                      <span>
                        {
                          visible.filter((task) => task.status === status)
                            .length
                        }
                      </span>
                    </h2>
                    <div className="space-y-2">
                      {visible
                        .filter((task) => task.status === status)
                        .map((task) => (
                          <TaskCard
                            key={task.id}
                            onOpen={() => setSelected(task.id)}
                            task={task}
                          />
                        ))}
                    </div>
                  </section>
                ))}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <div className="overflow-hidden rounded-xl border border-border">
                {visible.map((task) => (
                  <button
                    className="grid w-full grid-cols-[minmax(220px,2fr)_120px_100px_minmax(120px,1fr)] items-center gap-3 border-b p-3 text-left text-sm last:border-0 hover:bg-muted/40"
                    key={task.id}
                    onClick={() => setSelected(task.id)}
                    type="button"
                  >
                    <span className="font-medium">{task.title}</span>
                    <Status status={task.status} />
                    <span className="text-xs capitalize text-muted-foreground">
                      {task.priority}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {task.labels.join(", ")}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {selected && (
            <TaskDetail
              task={state.data.tasks.find((task) => task.id === selected)}
              onClose={() => setSelected(undefined)}
            />
          )}
        </div>
      )}
    </DesktopParityAppShell>
  );
}
function TaskCard({ onOpen, task }: { onOpen: () => void; task: Task }) {
  return (
    <button
      className="w-full rounded-xl border border-border bg-card p-3 text-left shadow-sm transition hover:-translate-y-px hover:shadow-md"
      onClick={onOpen}
      type="button"
    >
      <h3 className="text-sm font-medium">{task.title}</h3>
      {task.description && (
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
          {task.description}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-1">
        {task.labels.map((label) => (
          <span className="rounded bg-muted px-1.5 py-0.5 text-2xs" key={label}>
            {label}
          </span>
        ))}
        <span className="ml-auto text-2xs capitalize text-muted-foreground">
          {task.priority}
        </span>
      </div>
    </button>
  );
}
function Status({ status }: { status: TaskStatus }) {
  return (
    <span className="w-fit rounded-full bg-muted px-2 py-1 text-2xs capitalize">
      {status.replace("-", " ")}
    </span>
  );
}
function TaskDetail({ onClose, task }: { onClose: () => void; task?: Task }) {
  if (!task) return null;
  return (
    <aside className="absolute inset-y-0 right-0 z-20 w-[380px] border-l border-border bg-background p-5 shadow-xl max-[700px]:w-full">
      <button
        aria-label="Close task detail"
        className="float-right rounded-md p-1 hover:bg-muted"
        onClick={onClose}
        type="button"
      >
        <X className="size-4" />
      </button>
      <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
        Task
      </p>
      <h2 className="mt-2 pr-8 text-xl font-semibold">{task.title}</h2>
      <div className="mt-4">
        <Status status={task.status} />
      </div>
      <p className="mt-6 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
        {task.description || "No description."}
      </p>
      <dl className="mt-6 grid grid-cols-[100px_1fr] gap-y-3 text-sm">
        <dt className="text-muted-foreground">Priority</dt>
        <dd className="capitalize">{task.priority}</dd>
        <dt className="text-muted-foreground">Assignee</dt>
        <dd className="truncate">{task.assignee ?? "Unassigned"}</dd>
        <dt className="text-muted-foreground">Labels</dt>
        <dd>{task.labels.join(", ") || "—"}</dd>
      </dl>
    </aside>
  );
}
