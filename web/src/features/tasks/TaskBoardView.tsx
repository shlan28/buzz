import { Bot, Columns3, UserRound } from "lucide-react";
import type { ProfileLookup } from "@/features/profile/types";
import { TaskCard } from "./TaskCard";
import type { Task } from "./types";

export type TaskBoardColumn = {
  id: string;
  kind: "agent" | "person" | "group";
  label: string;
  tasks: Task[];
  typeLabel: string;
};

export function TaskBoardView({
  columns,
  onOpen,
  profiles,
  trackNames,
}: {
  columns: TaskBoardColumn[];
  onOpen: (taskId: string) => void;
  profiles: ProfileLookup;
  trackNames: ReadonlyMap<string, string>;
}) {
  return (
    <div
      className="flex min-h-0 flex-1 gap-4 overflow-x-auto p-5"
      data-testid="task-board"
    >
      {columns.map((column) => (
        <section
          className="flex w-72 shrink-0 flex-col rounded-xl bg-muted/40"
          data-testid={`task-column-${column.id}`}
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
              <h2 className="truncate text-sm font-semibold">{column.label}</h2>
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
                    ? profiles[task.assignee.toLowerCase()]
                    : undefined
                }
                key={task.id}
                onOpen={() => onOpen(task.id)}
                task={task}
                trackName={
                  task.trackId ? trackNames.get(task.trackId) : undefined
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
  );
}
