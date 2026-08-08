import { expect, test } from "@playwright/test";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import { assertSignedEventMatches } from "../../src/shared/api/nip46Client";
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
