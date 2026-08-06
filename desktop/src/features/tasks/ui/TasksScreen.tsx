import * as React from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutGrid, List, Plus, Search } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  buildTaskColumns,
  buildTaskStatusColumns,
  buildTaskTrackColumns,
  filterTasks,
} from "../lib/taskBoard";
import { useTasks } from "../hooks";
import { useTracks } from "@/features/tracks/hooks";
import type { TaskBoardGroup, TaskFilters } from "../types";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { TaskBoardView } from "./TaskBoardView";
import { TaskFilterSelect } from "./TaskFilterSelect";
import { TaskListView } from "./TaskListView";
import { TaskTagFilter } from "./TaskTagFilter";
import { TaskTrackFilter } from "./TaskTrackFilter";

export function TasksScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const routeSearch = location.search as {
    task?: string;
    view?: "board" | "list";
    group?: TaskBoardGroup;
    track?: string;
  };
  const routeTaskId = routeSearch.task ?? null;
  const tasks = useTasks();
  const tracks = useTracks();
  const view = routeSearch.view ?? "board";
  const groupBy = routeSearch.group ?? "assignee";
  const [filters, setFilters] = React.useState<TaskFilters>({
    query: "",
    statuses: new Set(),
    showDone: false,
    showEmptyAssignees: false,
    labels: new Set(),
    tracks: routeSearch.track ? new Set([routeSearch.track]) : new Set(),
    projects: new Set(),
    channels: new Set(),
  });
  const [creating, setCreating] = React.useState(false);
  const [mutationError, setMutationError] = React.useState<string>();
  const visible = React.useMemo(
    () => filterTasks(tasks.tasks, filters),
    [filters, tasks.tasks],
  );
  const columns = React.useMemo(
    () =>
      groupBy === "status"
        ? buildTaskStatusColumns(
            visible,
            filters.showEmptyAssignees,
            filters.showDone,
          )
        : groupBy === "track"
          ? buildTaskTrackColumns(
              visible,
              tracks.tracks.map((track) => ({
                id: track.id,
                name: track.name,
                archived: track.archived,
              })),
              filters.showEmptyAssignees,
            )
          : buildTaskColumns(
              visible,
              tasks.assignees,
              tasks.currentPubkey,
              filters.showEmptyAssignees,
            ),
    [
      filters.showDone,
      filters.showEmptyAssignees,
      groupBy,
      tasks.assignees,
      tasks.currentPubkey,
      tracks.tracks,
      visible,
    ],
  );
  const selected = tasks.tasks.find((task) => task.id === routeTaskId) ?? null;
  const trackOptions = React.useMemo(
    () =>
      tracks.tracks.map((track) => ({
        id: track.id,
        name: track.name,
        archived: track.archived,
      })),
    [tracks.tracks],
  );
  const trackNames = React.useMemo(
    () => new Map(tracks.tracks.map((track) => [track.id, track.name])),
    [tracks.tracks],
  );
  const selectedTrack =
    filters.tracks.size === 1 ? [...filters.tracks][0] : null;
  const filterOptions = React.useMemo(
    () => ({
      labels: unique(tasks.tasks.flatMap((task) => task.labels)),
      projects: unique(tasks.tasks.flatMap((task) => task.project ?? [])),
      channels: unique(tasks.tasks.flatMap((task) => task.channelId ?? [])),
    }),
    [tasks.tasks],
  );
  const updateRoute = (
    patch: Partial<{
      task: string | undefined;
      view: "board" | "list";
      group: TaskBoardGroup;
      track: string | undefined;
    }>,
  ) =>
    void navigate({
      to: "/tasks",
      search: {
        ...(routeTaskId ? { task: routeTaskId } : {}),
        view,
        group: groupBy,
        ...(routeSearch.track ? { track: routeSearch.track } : {}),
        ...patch,
      },
      replace: true,
    } as never);
  const openTask = (taskId: string | null) =>
    updateRoute({ task: taskId ?? undefined });

  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
      data-testid="tasks-screen"
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold tracking-tight">Tasks</h1>
          <p className="text-xs text-muted-foreground">
            {view === "board"
              ? groupBy === "status"
                ? "Work grouped by status"
                : groupBy === "track"
                  ? "Work grouped by track"
                  : "Work grouped by its current owner"
              : "All task details in one list"}
          </p>
        </div>
        {view === "board" ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Group by
            <select
              aria-label="Group tasks by"
              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              value={groupBy}
              onChange={(event) =>
                updateRoute({ group: event.target.value as TaskBoardGroup })
              }
            >
              <option value="assignee">Assignee</option>
              <option value="status">Status</option>
              <option value="track">Track</option>
            </select>
          </label>
        ) : null}
        <TaskTagFilter
          selected={filters.labels}
          values={filterOptions.labels}
          onChange={(labels) => setFilters({ ...filters, labels })}
        />
        <TaskTrackFilter
          selected={selectedTrack}
          tracks={trackOptions}
          onChange={(trackId) => {
            setFilters({
              ...filters,
              tracks: trackId ? new Set([trackId]) : new Set(),
            });
            updateRoute({ track: trackId ?? undefined });
          }}
        />
        <TaskFilterSelect
          label="projects"
          selected={filters.projects}
          values={filterOptions.projects}
          onChange={(projects) => setFilters({ ...filters, projects })}
        />
        <TaskFilterSelect
          label="channels"
          selected={filters.channels}
          values={filterOptions.channels}
          onChange={(channels) => setFilters({ ...filters, channels })}
        />
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search tasks"
            className="pl-8"
            placeholder="Search tasks…"
            value={filters.query}
            onChange={(event) =>
              setFilters({ ...filters, query: event.target.value })
            }
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            checked={filters.showDone}
            onChange={(event) =>
              setFilters({ ...filters, showDone: event.target.checked })
            }
            type="checkbox"
          />
          Show done
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            checked={filters.showEmptyAssignees}
            onChange={(event) =>
              setFilters({
                ...filters,
                showEmptyAssignees: event.target.checked,
              })
            }
            type="checkbox"
          />
          Show empty groups
        </label>
        <div className="flex rounded-md border border-border p-0.5">
          <Button
            aria-label="Board view"
            aria-pressed={view === "board"}
            className="h-7 px-2"
            onClick={() => updateRoute({ view: "board" })}
            size="sm"
            variant={view === "board" ? "secondary" : "ghost"}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            aria-label="List view"
            aria-pressed={view === "list"}
            className="h-7 px-2"
            onClick={() => updateRoute({ view: "list" })}
            size="sm"
            variant={view === "list" ? "secondary" : "ghost"}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
        <Button
          onClick={() => {
            setMutationError(undefined);
            setCreating(true);
          }}
          size="sm"
        >
          <Plus className="h-4 w-4" />
          Task
        </Button>
      </header>
      {mutationError && !selected ? (
        <div
          className="border-b border-destructive/30 bg-destructive/10 px-5 py-2 text-sm text-destructive"
          role="alert"
        >
          {mutationError} The task was moved back to its previous owner.
        </div>
      ) : null}
      {tasks.isLoading ? <Centered>Loading tasks…</Centered> : null}
      {tasks.isError ? (
        <Centered>
          <div className="space-y-3 text-center">
            <p>Tasks couldn&apos;t be loaded.</p>
            <Button
              onClick={() => void tasks.refetch()}
              size="sm"
              variant="outline"
            >
              Retry
            </Button>
          </div>
        </Centered>
      ) : null}
      {!tasks.isLoading && !tasks.isError && visible.length === 0 ? (
        <Centered>
          <div className="text-center">
            <p className="text-sm font-medium">No tasks here yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create a task or change the current filters.
            </p>
          </div>
        </Centered>
      ) : null}
      {!tasks.isLoading &&
      !tasks.isError &&
      visible.length > 0 &&
      view === "board" ? (
        <TaskBoardView
          assignees={tasks.assignees}
          columns={columns}
          executions={tasks.executions}
          groupBy={groupBy}
          trackNames={trackNames}
          pending={tasks.update.isPending}
          onOpen={openTask}
          onReassign={(task, assignee) => {
            setMutationError(undefined);
            tasks.update.mutate(
              { task, patch: { assignee } },
              { onError: (error) => setMutationError(message(error)) },
            );
          }}
          onStatusChange={(task, status) => {
            setMutationError(undefined);
            tasks.update.mutate(
              { task, patch: { status } },
              { onError: (error) => setMutationError(message(error)) },
            );
          }}
          onTrackChange={(task, trackId) => {
            setMutationError(undefined);
            tasks.update.mutate(
              { task, patch: { trackId } },
              { onError: (error) => setMutationError(message(error)) },
            );
          }}
        />
      ) : null}
      {!tasks.isLoading &&
      !tasks.isError &&
      visible.length > 0 &&
      view === "list" ? (
        <TaskListView
          assignees={tasks.assignees}
          executions={tasks.executions}
          trackNames={trackNames}
          tasks={visible}
          onOpen={openTask}
        />
      ) : null}
      <CreateTaskDialog
        assignees={tasks.assignees}
        tracks={trackOptions}
        tagSuggestions={filterOptions.labels}
        error={mutationError}
        open={creating}
        pending={tasks.create.isPending}
        onClose={() => setCreating(false)}
        onSave={(draft) => {
          setMutationError(undefined);
          tasks.create.mutate(draft, {
            onSuccess: () => setCreating(false),
            onError: (error) => setMutationError(message(error)),
          });
        }}
      />
      {selected ? (
        <TaskDetailPanel
          assignees={tasks.assignees}
          tracks={trackOptions}
          tagSuggestions={filterOptions.labels}
          error={mutationError}
          pending={tasks.update.isPending}
          deletePending={tasks.deleteTask.isPending}
          deleteError={
            tasks.deleteTask.error ? message(tasks.deleteTask.error) : undefined
          }
          task={selected}
          agentOnline={tasks.isAgentOnline(selected.assignee)}
          canExecute={tasks.canExecute(selected)}
          execution={tasks.executions.get(selected.id)}
          executionError={
            tasks.execute.error ? message(tasks.execute.error) : undefined
          }
          executionPending={tasks.execute.isPending}
          onClose={() => openTask(null)}
          onDelete={() =>
            tasks.deleteTask.mutate(selected, {
              onSuccess: () => openTask(null),
            })
          }
          onExecute={() => tasks.execute.mutate(selected)}
          onOpenExecutionResult={(eventId) => {
            void navigate({
              to: "/",
              search: { item: eventId },
            } as never);
          }}
          onUpdate={(patch, onSuccess) => {
            setMutationError(undefined);
            tasks.update.mutate(
              { task: selected, patch },
              {
                onSuccess,
                onError: (error) => setMutationError(message(error)),
              },
            );
          }}
        />
      ) : null}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid flex-1 place-items-center p-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
function message(error: unknown) {
  return error instanceof Error ? error.message : "Could not save task.";
}
function unique(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
