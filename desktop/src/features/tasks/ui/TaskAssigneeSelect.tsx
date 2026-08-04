import * as React from "react";
import { cn } from "@/shared/lib/cn";
import {
  taskAssigneeFromSelectValue,
  taskAssigneeSelectValue,
} from "../lib/taskAssigneeSelection";
import type { TaskAssignee } from "../types";

export function TaskAssigneeSelect({
  label,
  value,
  assignees,
  pending = false,
  compact = false,
  onChange,
}: {
  label: string;
  value: string | null;
  assignees: TaskAssignee[];
  pending?: boolean;
  compact?: boolean;
  onChange: (assignee: string | null) => void;
}) {
  const id = React.useId();
  const [invalid, setInvalid] = React.useState(false);
  const selectedIndex = assignees.findIndex(
    (assignee) =>
      assignee.pubkey?.toLowerCase() === value?.toLowerCase() ||
      (assignee.pubkey === null && value === null),
  );
  const selectValue =
    selectedIndex >= 0 ? taskAssigneeSelectValue(selectedIndex) : "unknown";

  return (
    <label
      className={compact ? "block" : "block space-y-1.5 text-sm font-medium"}
      htmlFor={id}
    >
      <span className={compact ? "sr-only" : undefined}>{label}</span>
      <select
        aria-label={compact ? label : undefined}
        className={cn(
          "w-full rounded-md border border-input bg-background text-sm",
          compact ? "h-7 px-2 text-xs" : "flex h-9 px-3",
        )}
        disabled={pending}
        id={id}
        value={selectValue}
        onChange={(event) => {
          const assignee = taskAssigneeFromSelectValue(
            event.target.value,
            assignees,
          );
          if (assignee === undefined) {
            setInvalid(true);
            return;
          }
          setInvalid(false);
          onChange(assignee);
        }}
      >
        {selectedIndex < 0 ? (
          <option value="unknown">Unknown current assignee</option>
        ) : null}
        {assignees.map((assignee, index) => (
          <option
            disabled={assignee.canAssign === false}
            key={assignee.pubkey ?? "unassigned"}
            value={taskAssigneeSelectValue(index)}
          >
            {assignee.label}
            {assignee.kind === "agent" ? " · Agent" : ""}
            {assignee.canAssign === false
              ? ` — ${assignee.unavailableReason ?? "Unavailable"}`
              : ""}
          </option>
        ))}
      </select>
      {invalid ? (
        <span className="mt-1 block text-xs text-destructive" role="alert">
          This assignee is no longer available. Refresh and try again.
        </span>
      ) : null}
    </label>
  );
}
