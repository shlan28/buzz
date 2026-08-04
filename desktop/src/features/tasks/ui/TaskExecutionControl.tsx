import { Bot, Loader2, Play } from "lucide-react";
import { Button } from "@/shared/ui/button";
import type { TaskExecution } from "../types";

export function TaskExecutionControl({
  agentName,
  execution,
  online,
  pending,
  error,
  onExecute,
}: {
  agentName: string;
  execution?: TaskExecution;
  online: boolean;
  pending: boolean;
  error?: string;
  onExecute: () => void;
}) {
  const active =
    execution?.status === "queued" || execution?.status === "running";
  const retry = execution?.status === "failed";
  return (
    <section
      className="space-y-3 rounded-lg border border-border bg-muted/30 p-3"
      data-testid="task-execution-control"
    >
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Agent execution</p>
          <p className="text-xs text-muted-foreground">
            Start {agentName} with the latest task details.
          </p>
        </div>
      </div>
      <Button
        className="w-full"
        disabled={!online || pending || active}
        onClick={onExecute}
        size="sm"
      >
        {pending || active ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        {pending
          ? "Sending…"
          : execution?.status === "queued"
            ? "Queued"
            : execution?.status === "running"
              ? "Running"
              : retry
                ? "Retry"
                : "Execute"}
      </Button>
      {!online ? (
        <p className="text-xs text-amber-700 dark:text-amber-300" role="status">
          {agentName} is offline. Start the Agent before executing this task.
        </p>
      ) : null}
      {retry && execution.message ? (
        <p className="text-xs text-destructive" role="alert">
          {execution.message}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
