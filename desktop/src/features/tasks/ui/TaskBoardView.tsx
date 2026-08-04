import type { Task, TaskAssignee, TaskExecution } from "../types";
import type { TaskColumnModel } from "../lib/taskBoard";
import { Bot, UserRound } from "lucide-react";
import { TaskCard } from "./TaskCard";

export function TaskBoardView({
  columns,
  assignees,
  pending,
  onOpen,
  onReassign,
  executions,
}: {
  columns: TaskColumnModel[];
  assignees: TaskAssignee[];
  pending: boolean;
  onOpen: (taskId: string) => void;
  onReassign: (task: Task, assignee: string | null) => void;
  executions: ReadonlyMap<string, TaskExecution>;
}) {
  return (
    <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto p-5">
      {columns.map((column) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: Native drop target; each card also has a keyboard-operable assignee select.
        <section
          className="flex w-72 shrink-0 flex-col rounded-xl bg-muted/40 ring-primary/0 transition-shadow data-[drag-over=true]:ring-2"
          data-testid={`task-column-${column.pubkey ?? "unassigned"}`}
          key={column.pubkey ?? "unassigned"}
          onDragOver={(event) => {
            if (column.canAssign !== false && !pending) event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            const task = column.tasks.find(
              (item) => item.id === event.dataTransfer.getData("text/task-id"),
            );
            const allTasks = columns.flatMap((item) => item.tasks);
            const dragged =
              task ??
              allTasks.find(
                (item) =>
                  item.id === event.dataTransfer.getData("text/task-id"),
              );
            if (dragged && dragged.assignee !== column.pubkey)
              onReassign(dragged, column.pubkey);
          }}
        >
          <header className="flex items-center gap-2 px-3 py-3">
            {column.kind === "agent" ? (
              <Bot className="h-4 w-4" />
            ) : (
              <UserRound className="h-4 w-4" />
            )}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold">{column.label}</h2>
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
              // biome-ignore lint/a11y/noStaticElementInteractions: Drag is an enhancement; the nested select provides the keyboard equivalent.
              <div
                draggable={!pending}
                key={task.id}
                onDragStart={(event) =>
                  event.dataTransfer.setData("text/task-id", task.id)
                }
              >
                <TaskCard
                  assignees={assignees}
                  execution={executions.get(task.id)}
                  task={task}
                  onOpen={() => onOpen(task.id)}
                  onReassign={(assignee) => onReassign(task, assignee)}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
