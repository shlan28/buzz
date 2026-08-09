import assert from "node:assert/strict";
import test from "node:test";
import { taskExecutionPresentation } from "./taskExecutionPresentation.ts";

test("presents active work separately from result finalization", () => {
  assert.deepEqual(
    taskExecutionPresentation("in-progress", { status: "running" }),
    {
      label: "Running",
      state: "running",
      resultAvailable: false,
    },
  );
  assert.deepEqual(taskExecutionPresentation("done", { status: "running" }), {
    label: "Finishing result…",
    state: "finishing",
    resultAvailable: false,
  });
  assert.deepEqual(taskExecutionPresentation("done", { status: "queued" }), {
    label: "Finishing result…",
    state: "finishing",
    resultAvailable: false,
  });
});

test("only terminal executions expose an Inbox result", () => {
  assert.equal(
    taskExecutionPresentation("done", { status: "finished" }).resultAvailable,
    true,
  );
  assert.deepEqual(taskExecutionPresentation("done", { status: "failed" }), {
    label: "Result delivery failed",
    state: "failed",
    resultAvailable: true,
  });
  assert.equal(taskExecutionPresentation("done").resultAvailable, false);
});
