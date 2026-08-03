import * as React from "react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import type {
  TaskAssignee,
  TaskDraft,
  TaskPriority,
  TaskStatus,
} from "../types";
import {
  dueTimestampToLocalDate,
  localDateToDueTimestamp,
} from "../lib/taskDates";

export function CreateTaskDialog({
  assignees,
  open,
  pending,
  error,
  onClose,
  onSave,
}: {
  assignees: TaskAssignee[];
  open: boolean;
  pending: boolean;
  error?: string;
  onClose: () => void;
  onSave: (draft: TaskDraft) => void;
}) {
  const [draft, setDraft] = React.useState<TaskDraft>(() => blankDraft());
  React.useEffect(() => {
    if (!open) setDraft(blankDraft());
  }, [open]);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg" data-testid="create-task-dialog">
        <DialogHeader>
          <DialogTitle>Create task</DialogTitle>
          <DialogDescription>
            Capture the work now. Assigning an Agent does not start it
            automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label
            className="block space-y-1.5 text-sm font-medium"
            htmlFor="create-task-title"
          >
            Title
            <Input
              autoFocus
              id="create-task-title"
              value={draft.title}
              onChange={(event) =>
                setDraft({ ...draft, title: event.target.value })
              }
            />
          </label>
          <label
            className="block space-y-1.5 text-sm font-medium"
            htmlFor="create-task-description"
          >
            Description
            <Textarea
              id="create-task-description"
              value={draft.description}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Assignee"
              value={draft.assignee ?? ""}
              onChange={(value) =>
                setDraft({ ...draft, assignee: value || null })
              }
              options={assignees.map((a) => ({
                value: a.pubkey ?? "",
                label: `${a.label}${a.kind === "agent" ? " · Agent" : ""}${a.canAssign === false ? ` — ${a.unavailableReason ?? "Unavailable"}` : ""}`,
                disabled: a.canAssign === false,
              }))}
            />
            <SelectField
              label="Status"
              value={draft.status}
              onChange={(value) =>
                setDraft({ ...draft, status: value as TaskStatus })
              }
              options={STATUS_OPTIONS}
            />
            <SelectField
              label="Priority"
              value={draft.priority}
              onChange={(value) =>
                setDraft({ ...draft, priority: value as TaskPriority })
              }
              options={PRIORITY_OPTIONS}
            />
            <label
              className="block space-y-1.5 text-sm font-medium"
              htmlFor="create-task-due-date"
            >
              Due date
              <Input
                id="create-task-due-date"
                type="date"
                value={dueTimestampToLocalDate(draft.dueDate)}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    dueDate: localDateToDueTimestamp(event.target.value),
                  })
                }
              />
            </label>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            disabled={pending || !draft.title.trim()}
            onClick={() => onSave(draft)}
          >
            {pending ? "Creating…" : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function blankDraft(): TaskDraft {
  return {
    id: crypto.randomUUID(),
    title: "",
    description: "",
    assignee: null,
    status: "todo",
    priority: "none",
    dueDate: null,
  };
}
function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
}) {
  const id = React.useId();
  return (
    <label className="block space-y-1.5 text-sm font-medium" htmlFor={id}>
      {label}
      <select
        id={id}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
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
const STATUS_OPTIONS = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "Todo" },
  { value: "in-progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
];
const PRIORITY_OPTIONS = [
  { value: "none", label: "No priority" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];
