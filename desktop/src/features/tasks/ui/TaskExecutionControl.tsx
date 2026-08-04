import { Bot, ExternalLink, Loader2, Play } from "lucide-react";
import { Button } from "@/shared/ui/button";
import type { TaskExecution } from "../types";

export function TaskExecutionControl({
  agentName,
  execution,
  online,
  pending,
  error,
  onExecute,
  onOpenResult,
  canStart = true,
}: {
  agentName: string;
  execution?: TaskExecution;
  online: boolean;
  pending: boolean;
  error?: string;
  onExecute: () => void;
  onOpenResult?: () => void;
  canStart?: boolean;
}) {
  const active =
    execution?.status === "queued" || execution?.status === "running";
  const retry = execution?.status === "failed";
  const terminal = execution?.status === "finished" || retry;
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
      {terminal && onOpenResult ? (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span
            className={retry ? "text-destructive" : "text-muted-foreground"}
          >
            {retry ? "Execution failed" : "Execution finished"}
          </span>
          <Button onClick={onOpenResult} size="sm" variant="ghost">
            View result in Inbox
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
      {canStart && execution?.status !== "finished" ? (
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
      ) : null}
      {!online && canStart && execution?.status !== "finished" ? (
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
