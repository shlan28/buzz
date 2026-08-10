import { Bot, Loader2, Play, Square } from "lucide-react";
import type { TaskExecution } from "./types";

export function TaskExecutionControl({
  agentName,
  error,
  execution,
  pending,
  onExecute,
  onCancel,
  cancelPending = false,
  cancelError,
  statusAvailable = true,
}: {
  agentName: string;
  error?: string;
  execution?: TaskExecution;
  pending: boolean;
  onExecute: () => void;
  onCancel?: () => void;
  cancelPending?: boolean;
  cancelError?: string;
  statusAvailable?: boolean;
}) {
  const active =
    execution?.status === "queued" || execution?.status === "running";
  const terminal =
    execution?.status === "finished" || execution?.status === "failed";
  const restartable = terminal || execution?.status === "cancelled";
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
        disabled={pending || active || !statusAvailable}
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
              : restartable
                ? "Execute again"
                : "Execute"}
      </button>
      {active && onCancel ? (
        <button
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          disabled={cancelPending}
          onClick={onCancel}
          type="button"
        >
          {cancelPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Square className="size-4" />
          )}
          {cancelPending ? "Cancelling…" : "Cancel execution"}
        </button>
      ) : null}
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
      {execution?.status === "cancelled" ? (
        <p className="text-xs text-muted-foreground" role="status">
          Execution cancelled.
        </p>
      ) : null}
      {!statusAvailable ? (
        <p className="text-xs text-amber-700 dark:text-amber-300" role="status">
          Execution status unavailable. Reconnecting to Relay…
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {cancelError ? (
        <p className="text-xs text-destructive" role="alert">
          {cancelError}
        </p>
      ) : null}
    </section>
  );
}
