import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, LayoutGrid, List } from "lucide-react";
import { useMemo, useState } from "react";
import { profileLabel } from "@/features/profile/eventCodec";
import {
  TaskBoardView,
  type TaskBoardColumn,
} from "@/features/tasks/TaskBoardView";
import { TaskDetailPanel } from "@/features/tasks/TaskDetailPanel";
import { TaskListView } from "@/features/tasks/TaskListView";
import type { Task, TaskStatus } from "@/features/tasks/types";
import { executeTask } from "@/features/tasks/taskExecution";
import { useTaskExecutions } from "@/features/tasks/useTaskExecutions";
import { useWorkConsoleData } from "@/shared/hooks/useWorkConsoleData";
import { AsyncStateView } from "@/shared/ui/AsyncStateView";
import { DesktopParityAppShell } from "@/shared/ui/DesktopParityAppShell";

const statuses: TaskStatus[] = [
  "backlog",
  "todo",
  "in-progress",
  "blocked",
  "done",
];

export function TrackDetailPage({ trackId }: { trackId: string }) {
  const navigate = useNavigate();
  const { state, refresh } = useWorkConsoleData();
  const [view, setView] = useState<"board" | "list">("board");
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const [executionPending, setExecutionPending] = useState(false);
  const [executionError, setExecutionError] = useState<string>();
  const executionState = useTaskExecutions(
    state.status === "ready" ? state.data.taskExecutions : [],
    state.status === "ready" ? state.data.relaySelfPubkey : "",
  );
  const track =
    state.status === "ready"
      ? state.data.tracks.find((item) => item.id === trackId)
      : undefined;
  const tasks = useMemo(
    () =>
      state.status === "ready"
        ? state.data.tasks.filter(
            (task) => !task.archived && task.trackId === trackId,
          )
        : [],
    [state, trackId],
  );
  const columns = useMemo<TaskBoardColumn[]>(
    () =>
      statuses.map((status) => ({
        id: status,
        kind: "group",
        label: status.replace("-", " "),
        tasks: sortTasks(tasks.filter((task) => task.status === status)),
        typeLabel: "Status",
      })),
    [tasks],
  );

  return (
    <DesktopParityAppShell>
      {state.status !== "ready" ? (
        <AsyncStateView
          status={state.status}
          message={state.status === "error" ? state.message : undefined}
          onRetry={refresh}
        />
      ) : !track ? (
        <div className="grid flex-1 place-items-center text-center text-sm text-muted-foreground">
          <div>
            <p className="font-medium text-foreground">Track not found</p>
            <p className="mt-1">The track may not exist in this community.</p>
            <button
              className="mt-4 rounded-md border border-border px-3 py-2 text-foreground hover:bg-muted"
              onClick={() => void navigate({ to: "/app/tracks" })}
              type="button"
            >
              Back to Tracks
            </button>
          </div>
        </div>
      ) : (
        <div
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
          data-testid="track-detail-screen"
        >
          <header className="border-b border-border px-5 py-3">
            <div className="flex flex-wrap items-start gap-3">
              <button
                aria-label="Back to Tracks"
                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => void navigate({ to: "/app/tracks" })}
                type="button"
              >
                <ArrowLeft className="size-4" />
              </button>
              <div className="mr-auto min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-lg font-semibold tracking-tight">
                    {track.name}
                  </h1>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                    {track.status}
                  </span>
                </div>
                <p className="mt-1 max-w-3xl whitespace-pre-wrap text-sm text-muted-foreground">
                  {track.description || "No description"}
                </p>
              </div>
              <span className="rounded-full bg-muted px-2 py-1 text-2xs text-muted-foreground">
                Execute only
              </span>
            </div>
            <div className="mt-3 grid gap-3 text-xs text-muted-foreground sm:grid-cols-3">
              <span>
                Owner ·{" "}
                {track.owner
                  ? profileLabel(
                      state.data.profilesByPubkey[track.owner.toLowerCase()],
                      track.owner,
                    )
                  : "Unassigned"}
              </span>
              <span>
                Timeline · {track.startDate ?? "—"} – {track.endDate ?? "—"}
              </span>
              <span>
                {tasks.filter((task) => task.status === "done").length}/
                {tasks.length} tasks complete
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{
                  width: `${tasks.length ? Math.round((tasks.filter((task) => task.status === "done").length / tasks.length) * 100) : 0}%`,
                }}
              />
            </div>
          </header>
          <div className="flex items-center justify-end gap-1 border-b border-border px-5 py-2">
            <div className="flex rounded-md border border-border p-0.5">
              <button
                aria-label="Board view"
                aria-pressed={view === "board"}
                className={`rounded p-1.5 ${view === "board" ? "bg-muted" : "text-muted-foreground"}`}
                onClick={() => setView("board")}
                type="button"
              >
                <LayoutGrid className="size-4" />
              </button>
              <button
                aria-label="List view"
                aria-pressed={view === "list"}
                className={`rounded p-1.5 ${view === "list" ? "bg-muted" : "text-muted-foreground"}`}
                onClick={() => setView("list")}
                type="button"
              >
                <List className="size-4" />
              </button>
            </div>
          </div>
          {tasks.length === 0 ? (
            <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
              No visible tasks belong to this track yet.
            </div>
          ) : view === "board" ? (
            <TaskBoardView
              columns={columns}
              onOpen={setSelectedTaskId}
              profiles={state.data.profilesByPubkey}
              trackNames={new Map([[track.id, track.name]])}
            />
          ) : (
            <TaskListView onOpen={setSelectedTaskId} tasks={tasks} />
          )}
          {selectedTaskId && (
            <TaskDetailPanel
              assigneeProfile={
                state.data.tasks.find((task) => task.id === selectedTaskId)
                  ?.assignee
                  ? state.data.profilesByPubkey[
                      state.data.tasks
                        .find((task) => task.id === selectedTaskId)
                        ?.assignee?.toLowerCase() ?? ""
                    ]
                  : undefined
              }
              onClose={() => setSelectedTaskId(undefined)}
              task={state.data.tasks.find((task) => task.id === selectedTaskId)}
              execution={executionState.executions.get(selectedTaskId)}
              executionError={executionError}
              executionPending={executionPending}
              onExecute={
                state.data.tasks.find((task) => task.id === selectedTaskId)
                  ?.assignee &&
                state.data.profilesByPubkey[
                  state.data.tasks
                    .find((task) => task.id === selectedTaskId)
                    ?.assignee?.toLowerCase() ?? ""
                ]?.isAgent
                  ? async () => {
                      const task = state.data.tasks.find(
                        (item) => item.id === selectedTaskId,
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
              trackName={track.name}
            />
          )}
        </div>
      )}
    </DesktopParityAppShell>
  );
}

function sortTasks(tasks: Task[]) {
  const priorityOrder = ["urgent", "high", "medium", "low", "none"];
  return [...tasks].sort(
    (left, right) =>
      priorityOrder.indexOf(left.priority) -
        priorityOrder.indexOf(right.priority) ||
      right.updatedAt - left.updatedAt,
  );
}
