import * as React from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Bot, LayoutGrid, List, Plus, Search, UserRound } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { buildTaskColumns, filterTasks } from "../lib/taskBoard";
import { useTasks } from "../hooks";
import type { TaskFilters } from "../types";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { TaskCard } from "./TaskCard";
import { TaskDetailPanel } from "./TaskDetailPanel";

export function TasksScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const routeTaskId = (location.search as { task?: string }).task ?? null;
  const tasks = useTasks();
  const [view, setView] = React.useState<"board" | "list">("board");
  const [filters, setFilters] = React.useState<TaskFilters>({
    query: "",
    statuses: new Set(),
    showDone: false,
    showEmptyAssignees: false,
  });
  const [creating, setCreating] = React.useState(false);
  const [mutationError, setMutationError] = React.useState<string>();
  const visible = React.useMemo(
    () => filterTasks(tasks.tasks, filters),
    [filters, tasks.tasks],
  );
  const columns = React.useMemo(
    () =>
      buildTaskColumns(
        visible,
        tasks.assignees,
        tasks.currentPubkey,
        filters.showEmptyAssignees,
      ),
    [filters.showEmptyAssignees, tasks.assignees, tasks.currentPubkey, visible],
  );
  const selected = tasks.tasks.find((task) => task.id === routeTaskId) ?? null;
  const openTask = (taskId: string | null) =>
    void navigate({
      to: "/tasks",
      search: taskId ? { task: taskId } : {},
      replace: true,
    } as never);

  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
      data-testid="tasks-screen"
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold tracking-tight">Tasks</h1>
          <p className="text-xs text-muted-foreground">
            Work grouped by its current owner
          </p>
        </div>
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
        <div className="flex rounded-md border border-border p-0.5">
          <Button
            aria-label="Board view"
            className="h-7 px-2"
            onClick={() => setView("board")}
            size="sm"
            variant={view === "board" ? "secondary" : "ghost"}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            aria-label="List view"
            className="h-7 px-2"
            onClick={() => setView("list")}
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
        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto p-5">
          {columns.map((column) => (
            <section
              className="flex w-72 shrink-0 flex-col rounded-xl bg-muted/40"
              key={column.pubkey ?? "unassigned"}
            >
              <header className="flex items-center gap-2 px-3 py-3">
                {column.kind === "agent" ? (
                  <Bot className="h-4 w-4" />
                ) : (
                  <UserRound className="h-4 w-4" />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold">
                    {column.label}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {column.tasks.length}{" "}
                    {column.tasks.length === 1 ? "task" : "tasks"} ·{" "}
                    {column.kind === "agent"
                      ? "Agent"
                      : column.kind === "person"
                        ? "Person"
                        : "No owner"}
                  </p>
                </div>
              </header>
              <div className="space-y-2 overflow-y-auto px-2 pb-3">
                {column.tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onOpen={() => openTask(task.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
      {!tasks.isLoading &&
      !tasks.isError &&
      visible.length > 0 &&
      view === "list" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mx-auto max-w-4xl divide-y divide-border rounded-xl border border-border">
            {visible.map((task) => (
              <button
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                key={task.id}
                onClick={() => openTask(task.id)}
                type="button"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {task.title}
                </span>
                <span className="text-xs capitalize text-muted-foreground">
                  {task.status.replace("-", " ")}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <CreateTaskDialog
        assignees={tasks.assignees}
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
          error={mutationError}
          pending={tasks.update.isPending}
          task={selected}
          onClose={() => openTask(null)}
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
