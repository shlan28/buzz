import { expect, test } from "@playwright/test";
import { getPublicKey } from "nostr-tools";

import {
  bytesToHex,
  derivePairingProofs,
  hexToBytes,
} from "../../src/features/pairing/pairingCrypto";
import {
  MAX_OFFER_ATTEMPTS,
  shouldRetryPairingOffer,
} from "../../src/features/pairing/pairingSession";

test("matches the buzz-core NIP-AB ECDH and SAS vector", async () => {
  const sourcePrivateKey = hexToBytes(
    "7f4c11a9c9d1e3b5a7f2e4d6c8b0a2f4e6d8c0b2a4f6e8d0c2b4a6f8e0d2c4b5",
  );
  const targetPrivateKey = hexToBytes(
    "3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d5e7f9a1b3c5d7e9f1a3b5c7d9e1f3a5b",
  );
  const sourcePubkey = getPublicKey(sourcePrivateKey);
  const targetPubkey = getPublicKey(targetPrivateKey);

  expect(sourcePubkey).toBe(
    "199e64ca60662cb2d6e91d16cb065be51ad74a6ee5f8c5b0fdc53d246611ed9a",
  );
  expect(targetPubkey).toBe(
    "89a9fa762105d0aee2b19678246fe7b823aabbc4f4bf691a1ce8a70fcd36d6e4",
  );

  const proofs = await derivePairingProofs(
    targetPrivateKey,
    {
      sourcePubkey,
      sessionSecret: hexToBytes(
        "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
      ),
      relay: "wss://example.com/pair",
    },
    targetPubkey,
  );

  expect(proofs.sasCode).toBe("863346");
  expect(proofs.sessionId).toBe(
    "fb357d0f8e8d5a5ba3b2a91cb18c119e1567b07ffa38cdebb73e68df78f5a380",
  );
  expect(proofs.transcriptHash).toBe(
    "d662818ff8911fc60a2d025f8b8b4756107104e85888dd202d28db5ca2cf28d3",
  );
  expect(bytesToHex(targetPrivateKey)).toHaveLength(64);
});

test("pairing offer retries are bounded by verification, attempts, and expiry", () => {
  expect(shouldRetryPairingOffer(0, false, 100, 200)).toBe(true);
  expect(shouldRetryPairingOffer(MAX_OFFER_ATTEMPTS, false, 100, 200)).toBe(
    false,
  );
  expect(shouldRetryPairingOffer(0, true, 100, 200)).toBe(false);
  expect(shouldRetryPairingOffer(0, false, 200, 200)).toBe(false);
});
