import assert from "node:assert/strict";
import test from "node:test";
import { resolveTaskAssignmentAccess } from "./taskAssignmentAccess.ts";

test("allows owner, allowlist member, and anyone policy", () => {
  assert.equal(
    resolveTaskAssignmentAccess({
      viewerPubkey: "owner",
      ownerPubkey: "OWNER",
      policy: "owner_only",
      allowlist: [],
      locallyManaged: false,
    }).allowed,
    true,
  );
  assert.equal(
    resolveTaskAssignmentAccess({
      viewerPubkey: "member",
      ownerPubkey: "owner",
      policy: "allowlist",
      allowlist: ["MEMBER"],
      locallyManaged: false,
    }).allowed,
    true,
  );
  assert.equal(
    resolveTaskAssignmentAccess({
      viewerPubkey: "member",
      ownerPubkey: "owner",
      policy: "anyone",
      allowlist: [],
      locallyManaged: false,
    }).allowed,
    true,
  );
});

test("fails closed while Relay policy is unavailable", () => {
  const access = resolveTaskAssignmentAccess({
    viewerPubkey: "member",
    ownerPubkey: "owner",
    policy: null,
    allowlist: [],
    locallyManaged: false,
  });
  assert.equal(access.allowed, false);
  assert.match(access.reason, /Relay/);
});
