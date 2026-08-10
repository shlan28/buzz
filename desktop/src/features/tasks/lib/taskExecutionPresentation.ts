import type { TaskExecution, TaskStatus } from "../types";

export type TaskExecutionPresentation = {
  label: string | null;
  state:
    | "idle"
    | "queued"
    | "running"
    | "finishing"
    | "finished"
    | "failed"
    | "cancelled";
  resultAvailable: boolean;
};

export function taskExecutionPresentation(
  taskStatus: TaskStatus,
  execution?: Pick<TaskExecution, "status">,
): TaskExecutionPresentation {
  if (!execution) {
    return { label: null, state: "idle", resultAvailable: false };
  }
  if (execution.status === "finished") {
    return { label: null, state: "finished", resultAvailable: true };
  }
  if (execution.status === "failed") {
    return {
      label: "Result delivery failed",
      state: "failed",
      resultAvailable: true,
    };
  }
  if (execution.status === "cancelled") {
    return {
      label: "Cancelled",
      state: "cancelled",
      resultAvailable: false,
    };
  }
  if (taskStatus === "done") {
    return {
      label: "Finishing result…",
      state: "finishing",
      resultAvailable: false,
    };
  }
  if (execution.status === "queued") {
    return { label: "Queued", state: "queued", resultAvailable: false };
  }
  return { label: "Running", state: "running", resultAvailable: false };
}
