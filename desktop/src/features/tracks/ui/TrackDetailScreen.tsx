import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  RotateCcw,
  UsersRound,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { useTasks } from "@/features/tasks/hooks";
import { buildTaskStatusColumns } from "@/features/tasks/lib/taskBoard";
import { CreateTaskDialog } from "@/features/tasks/ui/CreateTaskDialog";
import { TaskBoardView } from "@/features/tasks/ui/TaskBoardView";
import { TaskDetailPanel } from "@/features/tasks/ui/TaskDetailPanel";
import { TaskListView } from "@/features/tasks/ui/TaskListView";
import { Button } from "@/shared/ui/button";
import { Progress } from "@/shared/ui/progress";
import { useTracks } from "../hooks";
import { visibleTrackProgress } from "../lib/trackProgress";
import type { TrackPatch } from "../types";
import { TrackEditorDialog } from "./TrackEditorDialog";
import { formatDate, TrackStatusBadge } from "./TrackList";

export function TrackDetailScreen({
  trackId,
  taskId,
}: {
  trackId: string;
  taskId?: string;
}) {
  const navigate = useNavigate();
  const tracksQuery = useTracks();
  const tasksQuery = useTasks();
  const [view, setView] = React.useState<"board" | "list">("board");
  const [editing, setEditing] = React.useState(false);
  const [creatingTask, setCreatingTask] = React.useState(false);
  const [mutationError, setMutationError] = React.useState<string>();
  const [taskMutationError, setTaskMutationError] = React.useState<string>();
  const [taskDetailError, setTaskDetailError] = React.useState<string>();
  const track = tracksQuery.tracks.find((item) => item.id === trackId);
  const tasks = React.useMemo(
    () =>
      tasksQuery.tasks.filter(
        (task) => !task.archived && task.trackId === trackId,
      ),
    [trackId, tasksQuery.tasks],
  );
  const progress = React.useMemo(
    () => visibleTrackProgress(trackId, tasksQuery.tasks),
    [trackId, tasksQuery.tasks],
  );
  const columns = React.useMemo(
    () => buildTaskStatusColumns(tasks, true, true),
    [tasks],
  );
  const ownerLabel = tracksQuery.owners.find(
    (owner) => owner.pubkey.toLowerCase() === track?.owner.toLowerCase(),
  )?.label;
  const ownerLabels = React.useMemo(
    () =>
      new Map(
        tracksQuery.owners.map((owner) => [
          owner.pubkey.toLowerCase(),
          owner.label,
        ]),
      ),
    [tracksQuery.owners],
  );
  const trackOptions = React.useMemo(
    () =>
      tracksQuery.tracks.map((item) => ({
        id: item.id,
        name: item.name,
        archived: item.archived,
      })),
    [tracksQuery.tracks],
  );
  const tagSuggestions = React.useMemo(
    () => [...new Set(tasksQuery.tasks.flatMap((task) => task.labels))].sort(),
    [tasksQuery.tasks],
  );
  const selectedTask = tasks.find((task) => task.id === taskId) ?? null;

  const openTask = (nextTaskId: string | null) => {
    setTaskDetailError(undefined);
    void navigate({
      to: "/tracks/$trackId",
      params: { trackId },
      search: nextTaskId ? { task: nextTaskId } : {},
      replace: true,
    } as never);
  };

  if (tracksQuery.isLoading || tasksQuery.isLoading) {
    return <Centered>Loading track…</Centered>;
  }
  if (tracksQuery.isError || tasksQuery.isError) {
    return (
      <Centered>
        <div className="space-y-3 text-center">
          <p>This track couldn&apos;t be loaded.</p>
          <Button
            onClick={() => {
              void tracksQuery.refetch();
              void tasksQuery.refetch();
            }}
            size="sm"
            variant="outline"
          >
            Retry
          </Button>
        </div>
      </Centered>
    );
  }
  if (!track) {
    return (
      <Centered>
        <div className="space-y-3 text-center">
          <p className="font-medium text-foreground">Track not found</p>
          <p>The track may not exist in this community.</p>
          <Button
            onClick={() => void navigate({ to: "/tracks" } as never)}
            size="sm"
            variant="outline"
          >
            Back to Tracks
          </Button>
        </div>
      </Centered>
    );
  }

  const save = (patch: TrackPatch) => {
    setMutationError(undefined);
    tracksQuery.update.mutate(
      { track, patch },
      {
        onSuccess: () => setEditing(false),
        onError: (error) =>
          setMutationError(
            error instanceof Error
              ? error.message
              : "The track could not be saved.",
          ),
      },
    );
  };
  const restore = () =>
    tracksQuery.update.mutate(
      { track, patch: { archived: false } },
      {
        onSuccess: () => toast.success(`“${track.name}” was restored.`),
        onError: (error) =>
          toast.error(
            error instanceof Error
              ? error.message
              : "The track could not be restored.",
          ),
      },
    );

  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
      data-testid="track-detail-screen"
    >
      <header className="border-b border-border px-5 py-3">
        <div className="flex flex-wrap items-start gap-3">
          <Button
            aria-label="Back to Tracks"
            onClick={() => void navigate({ to: "/tracks" } as never)}
            size="icon"
            variant="ghost"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="mr-auto min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-semibold tracking-tight">
                {track.name}
              </h1>
              <TrackStatusBadge status={track.status} />
            </div>
            <p className="mt-1 max-w-3xl whitespace-pre-wrap text-sm text-muted-foreground">
              {track.description || "No description"}
            </p>
          </div>
          {!track.archived && track.canManage ? (
            <Button
              onClick={() => setEditing(true)}
              size="sm"
              variant="outline"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          ) : null}
          {!track.archived ? (
            <Button
              aria-label="Add task to track"
              onClick={() => {
                setTaskMutationError(undefined);
                setCreatingTask(true);
              }}
              size="sm"
            >
              <Plus className="h-4 w-4" />
              Task
            </Button>
          ) : null}
          <Button
            onClick={() =>
              void navigate({
                to: "/tasks",
                search: { track: track.id },
              } as never)
            }
            size="sm"
          >
            View tasks
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <UserRound className="h-3.5 w-3.5" />
            {ownerLabel ?? "Unknown owner"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatDate(track.startDate)} – {formatDate(track.endDate)}
          </span>
          <span>
            {progress.completed}/{progress.total} visible tasks completed
          </span>
          <Progress className="h-1.5 w-36" value={progress.percent} />
          {!track.canManage ? (
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
              Read only
            </span>
          ) : null}
        </div>
        <div
          className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
          data-testid="track-members"
        >
          <UsersRound className="mr-1 h-3.5 w-3.5" />
          {track.members.length === 0 ? (
            <span>No additional members</span>
          ) : (
            track.members.map((member) => (
              <span
                className="rounded-full bg-muted px-2 py-1 text-foreground"
                key={member}
              >
                {ownerLabels.get(member.toLowerCase()) ?? "Unknown member"}
              </span>
            ))
          )}
        </div>
      </header>
      {track.archived ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-5 py-2 text-sm">
          <div className="mr-auto">
            <span className="font-medium">Archived Track</span>
            <span className="ml-2 text-muted-foreground">
              This track is hidden from Current and Completed views.
            </span>
          </div>
          {track.canManage ? (
            <Button
              disabled={tracksQuery.update.isPending}
              onClick={restore}
              size="sm"
              variant="outline"
            >
              <RotateCcw className="h-4 w-4" />
              Restore track
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center justify-end gap-1 border-b border-border px-5 py-2">
        <div className="flex rounded-md border border-border p-0.5">
          <Button
            aria-label="Board view"
            aria-pressed={view === "board"}
            className="h-7 px-2"
            onClick={() => setView("board")}
            size="sm"
            variant={view === "board" ? "secondary" : "ghost"}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            aria-label="List view"
            aria-pressed={view === "list"}
            className="h-7 px-2"
            onClick={() => setView("list")}
            size="sm"
            variant={view === "list" ? "secondary" : "ghost"}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {tasks.length === 0 ? (
        <Centered>No visible tasks belong to this track yet.</Centered>
      ) : view === "board" ? (
        <TaskBoardView
          assignees={tasksQuery.assignees}
          columns={columns}
          executions={tasksQuery.executions}
          groupBy="status"
          onOpen={(nextTaskId) => openTask(nextTaskId)}
          onReassign={(task, assignee) =>
            tasksQuery.update.mutate({ task, patch: { assignee } })
          }
          onStatusChange={(task, status) =>
            tasksQuery.update.mutate(
              { task, patch: { status } },
              {
                onError: (error) =>
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "The task could not be moved.",
                  ),
              },
            )
          }
          onTrackChange={(task, nextTrackId) =>
            tasksQuery.update.mutate({
              task,
              patch: { trackId: nextTrackId },
            })
          }
          pending={track.archived || tasksQuery.update.isPending}
        />
      ) : (
        <TaskListView
          assignees={tasksQuery.assignees}
          executions={tasksQuery.executions}
          onOpen={(nextTaskId) => openTask(nextTaskId)}
          tasks={tasks}
        />
      )}
      <TrackEditorDialog
        currentPubkey={tracksQuery.currentPubkey}
        error={mutationError}
        onClose={() => setEditing(false)}
        onSave={(value) => save(value as TrackPatch)}
        open={editing}
        owners={tracksQuery.owners}
        pending={tracksQuery.update.isPending}
        track={track}
      />
      <CreateTaskDialog
        assignees={tasksQuery.assignees}
        error={taskMutationError}
        initialTrackId={track.id}
        onClose={() => setCreatingTask(false)}
        onSave={(draft) => {
          setTaskMutationError(undefined);
          tasksQuery.create.mutate(draft, {
            onSuccess: () => setCreatingTask(false),
            onError: (error) =>
              setTaskMutationError(
                error instanceof Error
                  ? error.message
                  : "The task could not be created.",
              ),
          });
        }}
        open={creatingTask}
        pending={tasksQuery.create.isPending}
        tagSuggestions={tagSuggestions}
        trackLocked
        tracks={trackOptions}
      />
      {selectedTask ? (
        <TaskDetailPanel
          agentOnline={tasksQuery.isAgentOnline(selectedTask.assignee)}
          assignees={tasksQuery.assignees}
          cancelExecutionError={
            tasksQuery.cancelExecution.error
              ? message(tasksQuery.cancelExecution.error)
              : undefined
          }
          cancelExecutionPending={tasksQuery.cancelExecution.isPending}
          canExecute={tasksQuery.canExecute(selectedTask)}
          deleteError={
            tasksQuery.deleteTask.error
              ? message(tasksQuery.deleteTask.error)
              : undefined
          }
          deletePending={tasksQuery.deleteTask.isPending}
          error={taskDetailError}
          execution={tasksQuery.executions.get(selectedTask.id)}
          executionError={
            tasksQuery.execute.error
              ? message(tasksQuery.execute.error)
              : undefined
          }
          executionPending={tasksQuery.execute.isPending}
          onCancelExecution={() => {
            const execution = tasksQuery.executions.get(selectedTask.id);
            if (execution) tasksQuery.cancelExecution.mutate(execution);
          }}
          onClose={() => openTask(null)}
          onDelete={() =>
            tasksQuery.deleteTask.mutate(selectedTask, {
              onSuccess: () => openTask(null),
            })
          }
          onExecute={() => tasksQuery.execute.mutate(selectedTask)}
          onOpenExecutionResult={(eventId) => {
            void navigate({
              to: "/",
              search: { item: eventId },
            } as never);
          }}
          onUpdate={(patch, onSuccess) => {
            setTaskDetailError(undefined);
            tasksQuery.update.mutate(
              { task: selectedTask, patch },
              {
                onSuccess,
                onError: (error) => setTaskDetailError(message(error)),
              },
            );
          }}
          pending={tasksQuery.update.isPending}
          tagSuggestions={tagSuggestions}
          task={selectedTask}
          tracks={trackOptions}
        />
      ) : null}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Could not save task.";
}
