import { expect, test } from "@playwright/test";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import {
  assertSignedEventMatches,
  isSignerTransportError,
  signerSubscriptionOutcome,
  SIGNER_HEARTBEAT_INTERVAL_MS,
} from "../../src/shared/api/nip46Client";

test("waits for the matching signer EOSE and surfaces subscription conflicts", () => {
  expect(signerSubscriptionOutcome(["EOSE", "wanted"], "wanted")).toEqual({
    status: "ready",
  });
  expect(
    signerSubscriptionOutcome(["EOSE", "other"], "wanted"),
  ).toBeUndefined();
  expect(
    signerSubscriptionOutcome(
      ["CLOSED", "wanted", "error: #p already has a live subscriber"],
      "wanted",
    ),
  ).toEqual({
    status: "rejected",
    message: "error: #p already has a live subscriber",
  });
});
import {
  makePairedNip98AuthHeader,
  relayQueryErrorMessage,
} from "../../src/shared/api/relayHttp";
import { queryRelay } from "../../src/shared/api/relaySession";
import {
  workConsoleCalendarFilters,
  workConsoleCoreFilters,
} from "../../src/shared/api/communitySession";

test("rejects open-ended Relay filters before opening a socket", async () => {
  await expect(
    queryRelay(
      "wss://example.invalid",
      {
        userPubkey: "aa".repeat(32),
        signEvent: async () => {
          throw new Error("must not sign");
        },
        close() {},
      },
      [{}],
    ),
  ).rejects.toThrow("must declare event kinds");
});

test("accepts an exact valid signer response and rejects tampering", () => {
  const secret = generateSecretKey();
  const unsigned = {
    kind: 22_242,
    created_at: 100,
    tags: [
      ["relay", "wss://achoverse.xyz"],
      ["challenge", "test"],
    ],
    content: "",
  };
  const signed = finalizeEvent(unsigned, secret);
  expect(() =>
    assertSignedEventMatches(unsigned, signed, getPublicKey(secret)),
  ).not.toThrow();
  expect(() =>
    assertSignedEventMatches(
      unsigned,
      { ...signed, content: "tampered" },
      getPublicKey(secret),
    ),
  ).toThrow("invalid signed event");
  expect(() =>
    assertSignedEventMatches(unsigned, signed, "ff".repeat(32)),
  ).toThrow("invalid signed event");
});

test("classifies only recoverable signer transport failures for read retries", () => {
  expect(SIGNER_HEARTBEAT_INTERVAL_MS).toBe(25_000);
  expect(
    isSignerTransportError(new Error("Remote signer connection closed.")),
  ).toBe(true);
  expect(
    isSignerTransportError(new Error("Desktop did not answer get_public_key.")),
  ).toBe(true);
  expect(isSignerTransportError(new Error("invalid connection secret"))).toBe(
    false,
  );
  expect(
    isSignerTransportError(new Error("event kind 1 is not permitted")),
  ).toBe(false);
});

test("builds a payload-bound NIP-98 query authorization", async () => {
  const secret = generateSecretKey();
  const pubkey = getPublicKey(secret);
  const body = JSON.stringify([{ kinds: [39_000] }]);
  const header = await makePairedNip98AuthHeader(
    "https://achoverse.xyz/query",
    body,
    {
      userPubkey: pubkey,
      signEvent: async (unsigned) => finalizeEvent(unsigned, secret),
      close() {},
    },
  );
  const signed = JSON.parse(atob(header.slice("Nostr ".length)));
  expect(signed.pubkey).toBe(pubkey);
  expect(signed.tags).toContainEqual(["u", "https://achoverse.xyz/query"]);
  expect(signed.tags).toContainEqual(["method", "POST"]);
  expect(
    signed.tags.find((tag: string[]) => tag[0] === "payload")?.[1],
  ).toMatch(/^[0-9a-f]{64}$/);
});

test("surfaces the Relay error envelope instead of hiding a 403", () => {
  expect(
    relayQueryErrorMessage(
      { error: "restricted: calendar authors must be self" },
      403,
    ),
  ).toBe("restricted: calendar authors must be self");
  expect(relayQueryErrorMessage({ message: "denied" }, 403)).toBe("denied");
  expect(relayQueryErrorMessage(undefined, 403)).toBe(
    "Relay query failed (403).",
  );
});

test("isolates private Calendar filters from the core work console query", () => {
  const core = workConsoleCoreFilters();
  expect(core.flatMap((filter) => filter.kinds ?? [])).not.toContain(31_922);
  expect(core.flatMap((filter) => filter.kinds ?? [])).not.toContain(31_923);
  expect(workConsoleCalendarFilters()).toEqual([
    {
      kinds: [31_922, 31_923],
      owned_authors: true,
      limit: 500,
    },
  ]);
});
