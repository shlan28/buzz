import { Bot, Loader2, Play } from "lucide-react";
import type { TaskExecution } from "./types";

export function TaskExecutionControl({
  agentName,
  error,
  execution,
  pending,
  onExecute,
}: {
  agentName: string;
  error?: string;
  execution?: TaskExecution;
  pending: boolean;
  onExecute: () => void;
}) {
  const active =
    execution?.status === "queued" || execution?.status === "running";
  const terminal =
    execution?.status === "finished" || execution?.status === "failed";
  return (
    <section
      className="mt-6 space-y-3 rounded-lg border border-border bg-muted/30 p-3"
      data-testid="task-execution-control"
    >
      <div className="flex items-center gap-2">
        <Bot className="size-4 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Agent execution</p>
          <p className="text-xs text-muted-foreground">
            Start {agentName} with the latest task details.
          </p>
        </div>
      </div>
      <button
        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending || active}
        onClick={onExecute}
        type="button"
      >
        {pending || active ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Play className="size-4" />
        )}
        {pending
          ? "Sending…"
          : execution?.status === "queued"
            ? "Queued"
            : execution?.status === "running"
              ? "Running"
              : terminal
                ? "Execute again"
                : "Execute"}
      </button>
      {execution?.status === "finished" ? (
        <p className="text-xs text-muted-foreground" role="status">
          Execution finished.
        </p>
      ) : null}
      {execution?.status === "failed" ? (
        <p className="text-xs text-destructive" role="alert">
          {execution.message || "Execution failed."}
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
