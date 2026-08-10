import { KINDS } from "@/shared/domain/eventKinds";
import type { UnsignedNostrEvent } from "@/shared/lib/nostr-signer";
import { publishSignedEvent } from "@/shared/api/publishSignedEvent";
import type { Task, TaskExecution } from "./types";

export function buildTaskExecutionRequest(
  task: Task,
  executionId = crypto.randomUUID(),
): UnsignedNostrEvent {
  if (!task.assignee) throw new Error("Task is not assigned to an Agent.");
  const tags = [
    ["t", `task-id:${task.id}`],
    ["d", executionId],
    ["previous", task.eventId],
    ["e", task.eventId, "", "task-state"],
    ["p", task.assignee, "", "agent"],
  ];
  if (task.channelId) tags.push(["h", task.channelId]);
  return {
    kind: KINDS.taskExecutionRequest,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
  };
}

export async function executeTask(task: Task): Promise<string> {
  const executionId = crypto.randomUUID();
  const request = buildTaskExecutionRequest(task, executionId);
  if (import.meta.env.MODE === "e2e" && window.__BUZZ_E2E_EXECUTE_TASK__) {
    await window.__BUZZ_E2E_EXECUTE_TASK__(request);
    return executionId;
  }
  try {
    await publishSignedEvent(request);
    return executionId;
  } catch (error) {
    throw mapTaskExecutionError(error);
  }
}

export function buildTaskExecutionCancellation(
  execution: TaskExecution,
): UnsignedNostrEvent {
  return {
    kind: KINDS.taskExecutionUpdate,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["t", `task-id:${execution.taskId}`],
      ["d", execution.id],
      ["status", "cancelled"],
      ["p", execution.assignee, "", "agent"],
    ],
    content: "Cancelled by user",
  };
}

export async function cancelTaskExecution(
  execution: TaskExecution,
): Promise<void> {
  const cancellation = buildTaskExecutionCancellation(execution);
  if (import.meta.env.MODE === "e2e" && window.__BUZZ_E2E_CANCEL_TASK__) {
    await window.__BUZZ_E2E_CANCEL_TASK__(cancellation);
    return;
  }
  try {
    await publishSignedEvent(cancellation);
  } catch (error) {
    throw mapTaskExecutionError(error);
  }
}

export function mapTaskExecutionError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/offline|unavailable:/i.test(message))
    return new Error("Agent is offline. Start the Agent and try again.");
  if (/only the assigned Agent or its owner|restricted:/i.test(message))
    return new Error("Only the assigned Agent or its owner may execute.");
  if (/conflict:|task state changed|assignee changed/i.test(message))
    return new Error("The Task changed. Refresh it before executing again.");
  if (
    /load failed|network|fetch|connection|websocket|timed? out/i.test(message)
  )
    return new Error(
      "Delivery is unknown. Refresh execution status before trying again.",
    );
  return error instanceof Error ? error : new Error(message);
}
