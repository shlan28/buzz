import { LayoutGrid, List, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { profileLabel } from "@/features/profile/eventCodec";
import type { ProfileLookup } from "@/features/profile/types";
import type { Track } from "@/features/tracks/types";
import { useWorkConsoleData } from "@/shared/hooks/useWorkConsoleData";
import { AsyncStateView } from "@/shared/ui/AsyncStateView";
import { DesktopParityAppShell } from "@/shared/ui/DesktopParityAppShell";
import { TaskBoardView, type TaskBoardColumn } from "./TaskBoardView";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { TaskListView } from "./TaskListView";
import type { Task, TaskStatus } from "./types";
import { cancelTaskExecution, executeTask } from "./taskExecution";
import { useTaskExecutions } from "./useTaskExecutions";

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
  const [selected, setSelected] = useState<string | undefined>(
    () => new URLSearchParams(window.location.search).get("task") ?? undefined,
  );
  const [executionPending, setExecutionPending] = useState(false);
  const [executionError, setExecutionError] = useState<string>();
  const [cancelPending, setCancelPending] = useState(false);
  const [cancelError, setCancelError] = useState<string>();
  const executionState = useTaskExecutions(
    state.status === "ready" ? state.data.taskExecutions : [],
    state.status === "ready" ? state.data.relaySelfPubkey : "",
  );
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
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set("task", selected);
    else url.searchParams.delete("task");
    window.history.replaceState(window.history.state, "", url);
  }, [selected]);
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
              Execute and cancel
            </span>
          </header>
          {view === "board" ? (
            <TaskBoardView
              columns={columns}
              onOpen={setSelected}
              profiles={state.data.profilesByPubkey}
              trackNames={trackNames}
            />
          ) : (
            <TaskListView onOpen={setSelected} tasks={visible} />
          )}
          {selected && (
            <TaskDetailPanel
              assigneeProfile={
                state.data.tasks.find((task) => task.id === selected)?.assignee
                  ? state.data.profilesByPubkey[
                      state.data.tasks
                        .find((task) => task.id === selected)
                        ?.assignee?.toLowerCase() ?? ""
                    ]
                  : undefined
              }
              task={state.data.tasks.find((task) => task.id === selected)}
              execution={executionState.executions.get(selected)}
              executionError={executionError}
              executionPending={executionPending}
              executionStatusAvailable={executionState.statusAvailable}
              cancelPending={cancelPending}
              cancelError={cancelError}
              onCancel={
                executionState.executions.get(selected) &&
                ["queued", "running"].includes(
                  executionState.executions.get(selected)?.status ?? "",
                )
                  ? async () => {
                      const execution = executionState.executions.get(selected);
                      if (!execution) return;
                      setCancelPending(true);
                      setCancelError(undefined);
                      try {
                        await cancelTaskExecution(execution);
                        executionState.recordCancelled(execution.id);
                      } catch (error) {
                        setCancelError(
                          error instanceof Error
                            ? error.message
                            : "Could not cancel this execution.",
                        );
                      } finally {
                        setCancelPending(false);
                      }
                    }
                  : undefined
              }
              onExecute={
                canExecuteTask(
                  state.data.tasks,
                  state.data.profilesByPubkey,
                  selected,
                )
                  ? async () => {
                      const task = state.data.tasks.find(
                        (item) => item.id === selected,
                      );
                      if (!task?.assignee) return;
                      setExecutionPending(true);
                      setExecutionError(undefined);
                      try {
                        const executionId = await executeTask(task);
                        executionState.recordQueued({
                          executionId,
                          taskId: task.id,
                          assignee: task.assignee,
                          requester: state.data.userPubkey,
                        });
                      } catch (error) {
                        setExecutionError(
                          error instanceof Error
                            ? error.message
                            : "Could not execute this Task.",
                        );
                      } finally {
                        setExecutionPending(false);
                      }
                    }
                  : undefined
              }
              onClose={() => setSelected(undefined)}
              trackName={
                state.data.tasks.find((task) => task.id === selected)?.trackId
                  ? trackNames.get(
                      state.data.tasks.find((task) => task.id === selected)
                        ?.trackId ?? "",
                    )
                  : undefined
              }
            />
          )}
        </div>
      )}
    </DesktopParityAppShell>
  );
}

function canExecuteTask(
  tasks: Task[],
  profiles: ProfileLookup,
  taskId: string,
) {
  const task = tasks.find((item) => item.id === taskId);
  return Boolean(
    task?.assignee && profiles[task.assignee.toLowerCase()]?.isAgent,
  );
}

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
): TaskBoardColumn[] {
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
