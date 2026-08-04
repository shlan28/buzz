import * as React from "react";
import { Archive, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { truncatePubkey } from "@/shared/lib/pubkey";
import type {
  Task,
  TaskAssignee,
  TaskPatch,
  TaskPriority,
  TaskStatus,
} from "../types";
import { TaskHistory } from "./TaskHistory";
import {
  dueTimestampToLocalDate,
  localDateToDueTimestamp,
} from "../lib/taskDates";
import { TaskAssigneeSelect } from "./TaskAssigneeSelect";

export function TaskDetailPanel({
  task,
  assignees,
  pending,
  error,
  onClose,
  onUpdate,
}: {
  task: Task;
  assignees: TaskAssignee[];
  pending: boolean;
  error?: string;
  onClose: () => void;
  onUpdate: (patch: TaskPatch, onSuccess?: () => void) => void;
}) {
  const [title, setTitle] = React.useState(task.title);
  const [description, setDescription] = React.useState(task.description);
  const [dueDate, setDueDate] = React.useState(() =>
    dueTimestampToLocalDate(task.dueDate),
  );
  React.useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setDueDate(dueTimestampToLocalDate(task.dueDate));
  }, [task.description, task.dueDate, task.title]);
  const textChanged =
    title.trim() !== task.title || description !== task.description;
  return (
    <aside
      className="absolute inset-y-0 right-0 z-20 flex w-full max-w-md flex-col border-l border-border bg-background shadow-xl"
      data-testid="task-detail-panel"
    >
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <p className="text-xs text-muted-foreground">Task details</p>
          <h2 className="mt-0.5 text-base font-semibold">{task.title}</h2>
        </div>
        <Button
          aria-label="Close task details"
          onClick={onClose}
          size="icon"
          variant="ghost"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <label
          className="block space-y-1.5 text-sm font-medium"
          htmlFor="task-detail-title"
        >
          Title
          <Input
            id="task-detail-title"
            maxLength={256}
            disabled={pending}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label
          className="block space-y-1.5 text-sm font-medium"
          htmlFor="task-detail-description"
        >
          Description
          <Textarea
            id="task-detail-description"
            disabled={pending}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <Button
          disabled={pending || !title.trim() || !textChanged}
          onClick={() => onUpdate({ title: title.trim(), description })}
          size="sm"
        >
          {pending ? "Saving…" : "Save text"}
        </Button>
        <TaskAssigneeSelect
          assignees={assignees}
          label="Assignee"
          pending={pending}
          value={task.assignee}
          onChange={(assignee) => onUpdate({ assignee })}
        />
        <Select
          label="Status"
          pending={pending}
          value={task.status}
          onChange={(value) => onUpdate({ status: value as TaskStatus })}
          options={[
            { value: "backlog", label: "Backlog" },
            { value: "todo", label: "Todo" },
            { value: "in-progress", label: "In progress" },
            { value: "blocked", label: "Blocked" },
            { value: "done", label: "Done" },
          ]}
        />
        <Select
          label="Priority"
          pending={pending}
          value={task.priority}
          onChange={(value) => onUpdate({ priority: value as TaskPriority })}
          options={[
            { value: "none", label: "No priority" },
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
            { value: "urgent", label: "Urgent" },
          ]}
        />
        <label
          className="block space-y-1.5 text-sm font-medium"
          htmlFor="task-detail-due-date"
        >
          Due date
          <Input
            disabled={pending}
            id="task-detail-due-date"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </label>
        <div className="flex gap-2">
          <Button
            disabled={
              pending ||
              dueDate === dueTimestampToLocalDate(task.dueDate) ||
              (dueDate.length > 0 && localDateToDueTimestamp(dueDate) === null)
            }
            onClick={() =>
              onUpdate({ dueDate: localDateToDueTimestamp(dueDate) })
            }
            size="sm"
            variant="outline"
          >
            Save due date
          </Button>
          {task.dueDate !== null ? (
            <Button
              disabled={pending}
              onClick={() => {
                setDueDate("");
                onUpdate({ dueDate: null });
              }}
              size="sm"
              variant="ghost"
            >
              Clear
            </Button>
          ) : null}
        </div>
        <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <p>Created by {shortPubkey(task.creator)}</p>
          <p className="mt-1">Last edited by {shortPubkey(task.lastEditor)}</p>
        </div>
        <TaskHistory taskId={task.id} />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
      <footer className="border-t border-border p-4">
        <Button
          className="w-full"
          disabled={pending}
          onClick={() => onUpdate({ archived: true }, onClose)}
          variant="outline"
        >
          <Archive className="h-4 w-4" />
          Archive task
        </Button>
      </footer>
    </aside>
  );
}

function Select({
  label,
  value,
  pending,
  onChange,
  options,
}: {
  label: string;
  value: string;
  pending: boolean;
  onChange: (value: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
}) {
  const id = React.useId();
  return (
    <label className="block space-y-1.5 text-sm font-medium" htmlFor={id}>
      {label}
      <select
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        id={id}
        disabled={pending}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option
            disabled={option.disabled}
            key={`${label}-${option.value || "none"}`}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
function shortPubkey(pubkey: string) {
  return truncatePubkey(pubkey);
}
