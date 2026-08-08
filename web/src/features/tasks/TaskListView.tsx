import { TaskStatusBadge } from "./TaskCard";
import type { Task } from "./types";

export function TaskListView({
  onOpen,
  tasks,
}: {
  onOpen: (taskId: string) => void;
  tasks: Task[];
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4" data-testid="task-list">
      <div className="overflow-hidden rounded-xl border border-border">
        {tasks.map((task) => (
          <button
            className="grid w-full grid-cols-[minmax(220px,2fr)_120px_100px_minmax(120px,1fr)] items-center gap-3 border-b p-3 text-left text-sm last:border-0 hover:bg-muted/40"
            key={task.id}
            onClick={() => onOpen(task.id)}
            type="button"
          >
            <span className="font-medium">{task.title}</span>
            <TaskStatusBadge status={task.status} />
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
  );
}
