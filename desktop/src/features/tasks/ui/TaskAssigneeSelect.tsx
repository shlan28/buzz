import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { resolveTaskAssigneeCandidate } from "../lib/taskAssigneeSelection";
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
  const selected = assignees.find(
    (assignee) =>
      assignee.pubkey?.toLowerCase() === value?.toLowerCase() ||
      (assignee.pubkey === null && value === null),
  );

  return (
    <div
      className={compact ? "block" : "block space-y-1.5 text-sm font-medium"}
    >
      <span className={compact ? "sr-only" : undefined}>{label}</span>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={label}
            className={cn(
              "w-full justify-between border-input bg-background font-normal",
              compact ? "h-7 px-2 text-xs" : "h-9 px-3 text-sm",
            )}
            disabled={pending}
            type="button"
            variant="outline"
          >
            <span className="truncate">
              {selected?.label ?? "Unknown current assignee"}
              {selected?.kind === "agent" ? " · Agent" : ""}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          onCloseAutoFocus={(event) => event.preventDefault()}
          style={{ minWidth: "var(--radix-dropdown-menu-trigger-width)" }}
        >
          {assignees.map((assignee) => (
            <DropdownMenuItem
              disabled={assignee.canAssign === false}
              key={assignee.pubkey ?? "unassigned"}
              onSelect={() => {
                const resolved = resolveTaskAssigneeCandidate(
                  assignee.pubkey,
                  assignees,
                );
                if (resolved !== undefined) onChange(resolved);
              }}
            >
              <Check
                className={cn(
                  "h-4 w-4",
                  assignee === selected ? "opacity-100" : "opacity-0",
                )}
              />
              <span>
                {assignee.label}
                {assignee.kind === "agent" ? " · Agent" : ""}
                {assignee.canAssign === false
                  ? ` — ${assignee.unavailableReason ?? "Unavailable"}`
                  : ""}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
