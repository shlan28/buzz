import {
  Bot,
  CalendarDays,
  CircleAlert,
  Columns3,
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { profileLabel } from "@/features/profile/eventCodec";
import type { ProfileLookup, UserProfile } from "@/features/profile/types";
import type { Track } from "@/features/tracks/types";
import { useWorkConsoleData } from "@/shared/hooks/useWorkConsoleData";
import { cn } from "@/shared/lib/cn";
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
  const [showEmpty, setShowEmpty] = useState(false);
  const [trackId, setTrackId] = useState(
    () => new URLSearchParams(window.location.search).get("track") ?? "",
  );
  const [groupBy, setGroupBy] = useState<"assignee" | "status" | "track">(() =>
    parseGroup(new URLSearchParams(window.location.search).get("group")),
  );
  const [selected, setSelected] = useState<string>();
  const visible = useMemo(
    () =>
      state.status === "ready"
        ? state.data.tasks.filter(
            (task) =>
              (showDone || task.status !== "done") &&
              (!trackId || task.trackId === trackId) &&
              `${task.title} ${task.description}`
                .toLowerCase()
                .includes(query.toLowerCase()),
          )
        : [],
    [query, showDone, state, trackId],
  );
  useEffect(() => {
    const url = new URL(window.location.href);
    if (trackId) url.searchParams.set("track", trackId);
    else url.searchParams.delete("track");
    url.searchParams.set("group", groupBy);
    window.history.replaceState(window.history.state, "", url);
  }, [groupBy, trackId]);
  useEffect(() => {
    const syncFromUrl = () => {
      const search = new URLSearchParams(window.location.search);
      setTrackId(search.get("track") ?? "");
      setGroupBy(parseGroup(search.get("group")));
    };
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);
  const trackNames = useMemo(
    () =>
      new Map(
        state.status === "ready"
          ? state.data.tracks.map((track) => [track.id, track.name])
          : [],
      ),
    [state],
  );
  const columns = useMemo(
    () =>
      state.status === "ready"
        ? buildColumns(
            visible,
            groupBy,
            showEmpty,
            state.data.userPubkey,
            state.data.profilesByPubkey,
            state.data.tracks,
            showDone,
          )
        : [],
    [groupBy, showDone, showEmpty, state, visible],
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
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Group by
              <select
                aria-label="Group tasks by"
                className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                onChange={(event) =>
                  setGroupBy(event.target.value as typeof groupBy)
                }
                value={groupBy}
              >
                <option value="assignee">Assignee</option>
                <option value="status">Status</option>
                <option value="track">Track</option>
              </select>
            </label>
            {state.data.tracks.length > 0 && (
              <select
                aria-label="Filter by track"
                className="h-8 max-w-48 rounded-md border border-input bg-background px-2 text-xs"
                onChange={(event) => setTrackId(event.target.value)}
                value={trackId}
              >
                <option value="">All tracks</option>
                {state.data.tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.name}
                  </option>
                ))}
              </select>
            )}
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm hover:bg-muted"
              onClick={() => setShowDone((value) => !value)}
              type="button"
            >
              <SlidersHorizontal className="size-4" />
              {showDone ? "Hide done" : "Show done"}
            </button>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                checked={showEmpty}
                onChange={(event) => setShowEmpty(event.target.checked)}
                type="checkbox"
              />
              Show empty groups
            </label>
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
            <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto p-5">
              {columns.map((column) => (
                <section
                  className="flex w-72 shrink-0 flex-col rounded-xl bg-muted/40"
                  key={column.id}
                >
                  <header className="flex items-center gap-2 px-3 py-3">
                    {column.kind === "agent" ? (
                      <Bot className="size-4" />
                    ) : column.kind === "person" ? (
                      <UserRound className="size-4" />
                    ) : (
                      <Columns3 className="size-4" />
                    )}
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-sm font-semibold">
                        {column.label}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {column.tasks.length}{" "}
                        {column.tasks.length === 1 ? "task" : "tasks"} ·{" "}
                        {column.typeLabel}
                      </p>
                    </div>
                  </header>
                  <div className="space-y-2 overflow-y-auto px-2 pb-3">
                    {column.tasks.map((task) => (
                      <TaskCard
                        assigneeProfile={
                          task.assignee
                            ? state.data.profilesByPubkey[
                                task.assignee.toLowerCase()
                              ]
                            : undefined
                        }
                        key={task.id}
                        onOpen={() => setSelected(task.id)}
                        task={task}
                        trackName={
                          task.trackId
                            ? trackNames.get(task.trackId)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </section>
              ))}
              {columns.length === 0 && (
                <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
                  No tasks match the current filters.
                </div>
              )}
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
function TaskCard({
  assigneeProfile,
  onOpen,
  task,
  trackName,
}: {
  assigneeProfile?: UserProfile;
  onOpen: () => void;
  task: Task;
  trackName?: string;
}) {
  const overdue = Boolean(
    task.due && task.status !== "done" && task.due.getTime() < Date.now(),
  );
  const assigneeLabel = task.assignee
    ? profileLabel(assigneeProfile, task.assignee)
    : "Unassigned";
  return (
    <article
      className="w-full rounded-xl border border-border bg-card p-3 text-left shadow-xs transition-colors hover:border-primary/30 hover:bg-muted/30"
      data-testid={`task-card-${task.id}`}
    >
      <button
        className="line-clamp-2 w-full text-left text-sm font-medium text-card-foreground"
        onClick={onOpen}
        type="button"
      >
        {task.title}
      </button>
      <p
        className={cn(
          "mt-1 line-clamp-2 min-h-10 text-xs leading-5",
          task.description
            ? "text-muted-foreground"
            : "text-muted-foreground/60",
        )}
      >
        {task.description || "No description"}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Status status={task.status} />
        {trackName && (
          <span className="rounded-md bg-muted px-1.5 py-0.5">{trackName}</span>
        )}
        {task.labels.slice(0, 2).map((label) => (
          <span className="rounded-md bg-muted px-1.5 py-0.5" key={label}>
            {label}
          </span>
        ))}
        {task.labels.length > 2 && <span>+{task.labels.length - 2}</span>}
        {task.priority !== "none" && (
          <span
            className={cn(
              "capitalize",
              task.priority === "urgent" && "text-destructive",
            )}
          >
            {task.priority}
          </span>
        )}
        {task.due && (
          <span
            className={cn(
              "inline-flex items-center gap-1",
              overdue && "text-destructive",
            )}
          >
            {overdue ? (
              <CircleAlert className="size-3" />
            ) : (
              <CalendarDays className="size-3" />
            )}
            {task.due.toLocaleDateString("en-CA")}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        {assigneeProfile?.isAgent ? (
          <Bot className="size-3.5" />
        ) : (
          <UserRound className="size-3.5" />
        )}
        <span className="truncate">{assigneeLabel}</span>
        {assigneeProfile?.isAgent && <span>· Agent</span>}
      </div>
    </article>
  );
}
function Status({ status }: { status: TaskStatus }) {
  const presentation: Record<TaskStatus, { label: string; className: string }> =
    {
      backlog: {
        label: "Backlog",
        className: "bg-muted text-muted-foreground",
      },
      todo: {
        label: "Todo",
        className: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
      },
      "in-progress": {
        label: "In progress",
        className: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
      },
      blocked: {
        label: "Blocked",
        className: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
      },
      done: {
        label: "Done",
        className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
      },
    };
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium",
        presentation[status].className,
      )}
      data-task-status={status}
    >
      {presentation[status].label}
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

type TaskColumn = {
  id: string;
  kind: "agent" | "person" | "group";
  label: string;
  tasks: Task[];
  typeLabel: string;
};

function parseGroup(value: string | null): "assignee" | "status" | "track" {
  return value === "status" || value === "track" ? value : "assignee";
}

function buildColumns(
  tasks: Task[],
  groupBy: "assignee" | "status" | "track",
  showEmpty: boolean,
  currentPubkey: string,
  profiles: ProfileLookup,
  tracks: Track[],
  showDone: boolean,
): TaskColumn[] {
  if (groupBy === "status") {
    return statuses
      .filter((status) => showDone || status !== "done")
      .map((status) => ({
        id: status,
        kind: "group" as const,
        label: status.replace("-", " "),
        tasks: sortTasks(tasks.filter((task) => task.status === status)),
        typeLabel: "Status",
      }))
      .filter((column) => showEmpty || column.tasks.length > 0);
  }
  if (groupBy === "track") {
    return [
      { id: "", name: "No track" },
      ...tracks.filter((track) => !track.archived),
    ]
      .map((track) => ({
        id: track.id || "no-track",
        kind: "group" as const,
        label: track.name,
        tasks: sortTasks(
          tasks.filter((task) => (task.trackId ?? "") === track.id),
        ),
        typeLabel: "Track",
      }))
      .filter((column) => showEmpty || column.tasks.length > 0);
  }
  const pubkeys = new Set(tasks.map((task) => task.assignee ?? ""));
  if (showEmpty) {
    for (const pubkey of Object.keys(profiles)) pubkeys.add(pubkey);
  }
  return [...pubkeys]
    .map((pubkey) => {
      const profile = pubkey ? profiles[pubkey.toLowerCase()] : undefined;
      return {
        id: pubkey || "unassigned",
        kind: profile?.isAgent ? ("agent" as const) : ("person" as const),
        label: pubkey ? profileLabel(profile, pubkey) : "Unassigned",
        tasks: sortTasks(
          tasks.filter(
            (task) =>
              (task.assignee ?? "").toLowerCase() === pubkey.toLowerCase(),
          ),
        ),
        typeLabel: pubkey
          ? profile?.isAgent
            ? "Agent"
            : "Person"
          : "No owner",
      };
    })
    .filter((column) => showEmpty || column.tasks.length > 0)
    .sort((left, right) => {
      if (left.id === "unassigned") return -1;
      if (right.id === "unassigned") return 1;
      if (left.id.toLowerCase() === currentPubkey.toLowerCase()) return -1;
      if (right.id.toLowerCase() === currentPubkey.toLowerCase()) return 1;
      return (
        right.tasks.length - left.tasks.length ||
        left.label.localeCompare(right.label)
      );
    });
}

function sortTasks(tasks: Task[]) {
  const statusOrder = ["blocked", "in-progress", "todo", "backlog", "done"];
  const priorityOrder = ["urgent", "high", "medium", "low", "none"];
  return [...tasks].sort(
    (left, right) =>
      statusOrder.indexOf(left.status) - statusOrder.indexOf(right.status) ||
      priorityOrder.indexOf(left.priority) -
        priorityOrder.indexOf(right.priority) ||
      left.updatedAt - right.updatedAt,
  );
}
