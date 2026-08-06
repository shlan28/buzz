import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { truncatePubkey } from "@/shared/lib/pubkey";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { IdentityOptionSummary } from "@/shared/ui/IdentityOptionSummary";
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
  const selectedOption =
    selected ??
    (value
      ? {
          pubkey: value,
          label: truncatePubkey(value),
          selectorLabel: "Unavailable identity",
          shortId: truncatePubkey(value),
          kind: "person" as const,
          isCurrent: false,
          isNameLoading: false,
        }
      : undefined);

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
              compact ? "h-7 px-2 text-xs" : "h-auto min-h-9 px-3 py-2 text-sm",
            )}
            disabled={pending}
            type="button"
            variant="outline"
          >
            {selectedOption ? (
              <TaskIdentitySummary
                assignee={selectedOption}
                compact={compact}
              />
            ) : (
              <span className="truncate text-muted-foreground">
                Select an assignee
              </span>
            )}
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-[min(16rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto overflow-x-hidden overscroll-contain"
          onCloseAutoFocus={(event) => event.preventDefault()}
          onWheelCapture={(event) => event.stopPropagation()}
          style={{ minWidth: "var(--radix-dropdown-menu-trigger-width)" }}
        >
          {assignees.map((assignee) => (
            <DropdownMenuItem
              aria-label={assigneeAriaLabel(assignee)}
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
              <TaskIdentitySummary assignee={assignee} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function TaskIdentitySummary({
  assignee,
  compact = false,
}: {
  assignee: Pick<
    TaskAssignee,
    "selectorLabel" | "shortId" | "kind" | "isNameLoading" | "unavailableReason"
  >;
  compact?: boolean;
}) {
  return (
    <IdentityOptionSummary
      compact={compact}
      isNameLoading={assignee.isNameLoading}
      kind={assignee.kind === "unassigned" ? undefined : assignee.kind}
      label={assignee.selectorLabel}
      shortId={assignee.shortId}
      unavailableReason={assignee.unavailableReason}
    />
  );
}

function assigneeAriaLabel(assignee: TaskAssignee) {
  if (assignee.kind === "unassigned") return assignee.selectorLabel;
  const identityKind = assignee.kind === "agent" ? "Agent" : "User";
  return [
    assignee.selectorLabel,
    identityKind,
    assignee.shortId,
    assignee.canAssign === false
      ? (assignee.unavailableReason ?? "Unavailable")
      : null,
  ]
    .filter(Boolean)
    .join(", ");
}
