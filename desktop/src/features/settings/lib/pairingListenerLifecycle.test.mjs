import assert from "node:assert/strict";
import test from "node:test";

import {
  createPairingListenerLifecycle,
  shouldCancelPairingOnCleanup,
} from "./pairingListenerLifecycle.ts";

test("releases registered listeners once across repeated disposal", async () => {
  let calls = 0;
  const lifecycle = createPairingListenerLifecycle();
  lifecycle.add(Promise.resolve(() => calls++));
  await Promise.resolve();
  lifecycle.dispose();
  lifecycle.dispose();
  assert.equal(calls, 1);
});

test("releases a listener that resolves after disposal once", async () => {
  let resolveRegistration;
  let calls = 0;
  const lifecycle = createPairingListenerLifecycle();
  lifecycle.add(new Promise((resolve) => (resolveRegistration = resolve)));
  lifecycle.dispose();
  resolveRegistration(() => calls++);
  await Promise.resolve();
  lifecycle.dispose();
  assert.equal(calls, 1);
});

test("contains stale Tauri unlisten errors", async () => {
  const lifecycle = createPairingListenerLifecycle();
  lifecycle.add(
    Promise.resolve(() => {
      throw new TypeError("listener was already removed");
    }),
  );
  await Promise.resolve();
  assert.doesNotThrow(() => lifecycle.dispose());
});

test("only cancellable pre-transfer steps cancel on cleanup", () => {
  for (const step of ["generating", "qr", "sas"]) {
    assert.equal(shouldCancelPairingOnCleanup(step), true, step);
  }
  for (const step of ["idle", "expired", "transferring", "done", "error"]) {
    assert.equal(shouldCancelPairingOnCleanup(step), false, step);
  }
});
