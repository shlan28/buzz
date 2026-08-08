import { expect, test } from "@playwright/test";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import { assertSignedEventMatches } from "../../src/shared/api/nip46Client";
import { makePairedNip98AuthHeader } from "../../src/shared/api/relayHttp";
import { queryRelay } from "../../src/shared/api/relaySession";

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
