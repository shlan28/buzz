import { expect, test } from "@playwright/test";
import {
  latestTaskExecutions,
  parseTaskExecution,
} from "@/features/tasks/eventCodec";
import {
  buildTaskExecutionCancellation,
  buildTaskExecutionRequest,
  mapTaskExecutionError,
} from "@/features/tasks/taskExecution";
import type { Task } from "@/features/tasks/types";
import type { NostrEvent } from "@/shared/lib/nostr-client";
import { installWorkConsoleFixture } from "../helpers/desktopParityFixtures";

const agent = "22".repeat(32);
const relay = "44".repeat(32);
const task: Task = {
  id: "00000000-0000-4000-8000-000000000010",
  eventId: "55".repeat(32),
  title: "Execute me",
  description: "",
  status: "todo",
  priority: "high",
  assignee: agent,
  channelId: "00000000-0000-4000-8000-000000000001",
  labels: [],
  archived: false,
  updatedAt: 1,
};

test("builds the Desktop-compatible execution request", () => {
  const id = "00000000-0000-4000-8000-000000000099";
  const event = buildTaskExecutionRequest(task, id);
  expect(event.kind).toBe(42_503);
  expect(event.content).toBe("");
  expect(event.tags).toEqual([
    ["t", `task-id:${task.id}`],
    ["d", id],
    ["previous", task.eventId],
    ["e", task.eventId, "", "task-state"],
    ["p", agent, "", "agent"],
    ["h", task.channelId],
  ]);
});

test("builds the Desktop-compatible execution cancellation", () => {
  const id = "00000000-0000-4000-8000-000000000099";
  const event = buildTaskExecutionCancellation({
    id,
    eventId: "66".repeat(32),
    taskId: task.id,
    assignee: agent,
    requester: "11".repeat(32),
    status: "queued",
    message: "",
    updatedAt: 1,
  });
  expect(event.kind).toBe(42_504);
  expect(event.content).toBe("Cancelled by user");
  expect(event.tags).toEqual([
    ["t", `task-id:${task.id}`],
    ["d", id],
    ["status", "cancelled"],
    ["p", agent, "", "agent"],
  ]);
});

test("accepts only Relay execution states and keeps the newest state", () => {
  const makeEvent = (status: string, createdAt: number, pubkey = relay) =>
    ({
      id: `${status}-${createdAt}`,
      pubkey,
      kind: 30_501,
      created_at: createdAt,
      tags: [
        ["d", "00000000-0000-4000-8000-000000000099"],
        ["t", `task-id:${task.id}`],
        ["p", agent],
        ["requester", "11".repeat(32)],
        ["status", status],
      ],
      content: status === "failed" ? "Tool failed" : "",
      sig: "00".repeat(64),
    }) as NostrEvent;
  expect(parseTaskExecution(makeEvent("running", 2, agent), relay)).toBeNull();
  expect(parseTaskExecution(makeEvent("invented", 2), relay)).toBeNull();
  expect(parseTaskExecution(makeEvent("cancelled", 3), relay)?.status).toBe(
    "cancelled",
  );
  const queued = parseTaskExecution(makeEvent("queued", 1), relay);
  const running = parseTaskExecution(makeEvent("running", 2), relay);
  if (!queued || !running) throw new Error("Expected valid execution states");
  expect(latestTaskExecutions([running, queued]).get(task.id)?.status).toBe(
    "running",
  );
});

test("maps Relay execution failures without retrying ambiguous delivery", () => {
  expect(
    mapTaskExecutionError(new Error("unavailable: Agent is offline")).message,
  ).toContain("offline");
  expect(
    mapTaskExecutionError(new Error("conflict: task state changed")).message,
  ).toContain("changed");
  expect(mapTaskExecutionError(new Error("Load failed")).message).toContain(
    "unknown",
  );
});

test("shows Execute, queues once, and disables an active execution", async ({
  page,
}) => {
  await installWorkConsoleFixture(page);
  await page.addInitScript(() => {
    window.__BUZZ_E2E_EXECUTE_TASK__ = async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 80));
    };
  });
  await page.goto("/app/tasks");
  await page.getByText("Ship iPad console", { exact: true }).click();
  const button = page.getByRole("button", { name: "Execute" });
  await button.click();
  await expect(page.getByRole("button", { name: "Sending…" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Queued" })).toBeDisabled();
});

test("restores a terminal state and allows Execute again", async ({ page }) => {
  await installWorkConsoleFixture(page);
  await page.addInitScript(() => {
    const fixture = window.__BUZZ_E2E_WORK_CONSOLE_DATA__;
    if (fixture) {
      fixture.taskExecutions = [
        {
          id: "00000000-0000-4000-8000-000000000098",
          eventId: "77".repeat(32),
          taskId: "task-1",
          assignee: "22".repeat(32),
          requester: fixture.userPubkey,
          status: "finished",
          message: "",
          updatedAt: 1_754_640_500,
        },
      ];
    }
    window.__BUZZ_E2E_EXECUTE_TASK__ = async () => {};
  });
  await page.goto("/app/tracks/track-1");
  await page.getByText("Ship iPad console", { exact: true }).click();
  await expect(page.getByText("Execution finished.")).toBeVisible();
  await page.getByRole("button", { name: "Execute again" }).click();
  await expect(page.getByRole("button", { name: "Queued" })).toBeDisabled();
});

test("cancels an active execution and allows Execute again", async ({
  page,
}) => {
  await installWorkConsoleFixture(page);
  await page.addInitScript(() => {
    const fixture = window.__BUZZ_E2E_WORK_CONSOLE_DATA__;
    if (fixture) {
      fixture.taskExecutions = [
        {
          id: "00000000-0000-4000-8000-000000000097",
          eventId: "76".repeat(32),
          taskId: "task-1",
          assignee: "22".repeat(32),
          requester: fixture.userPubkey,
          status: "queued",
          message: "",
          updatedAt: 1_754_640_500,
        },
      ];
    }
    window.__BUZZ_E2E_CANCEL_TASK__ = async (event) => {
      window.__BUZZ_E2E_LAST_CANCEL_TASK__ = event;
      await new Promise((resolve) => window.setTimeout(resolve, 80));
    };
  });
  await page.goto("/app/tasks");
  await page.getByText("Ship iPad console", { exact: true }).click();
  await page.getByRole("button", { name: "Cancel execution" }).click();
  await expect(
    page.getByRole("button", { name: "Cancelling…" }),
  ).toBeDisabled();
  await expect(page.getByText("Execution cancelled.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Execute again" }),
  ).toBeEnabled();
  const cancellation = await page.evaluate(
    () => window.__BUZZ_E2E_LAST_CANCEL_TASK__,
  );
  expect(cancellation?.kind).toBe(42_504);
  expect(cancellation?.tags).toContainEqual(["status", "cancelled"]);
});
