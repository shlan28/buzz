import { secp256k1 } from "@noble/curves/secp256k1.js";

import type { PairingQrPayload } from "./types";

const HEX_64 = /^[0-9a-f]{64}$/;
const textEncoder = new TextEncoder();

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export function hexToBytes(hex: string): Uint8Array {
  if (!HEX_64.test(hex)) {
    throw new Error("Expected 32-byte lowercase hexadecimal data.");
  }
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], (byte) =>
    Number.parseInt(byte, 16),
  );
}

export function parsePairingUri(rawUri: string): PairingQrPayload {
  const uri = rawUri.trim();
  if (uri.length > 2048 || !uri.startsWith("nostrpair://")) {
    throw new Error("Enter a valid nostrpair:// link from Buzz Desktop.");
  }

  const parsed = new URL(uri);
  const sourcePubkey = parsed.hostname;
  const secretHex = parsed.searchParams.get("secret") ?? "";
  const version = parsed.searchParams.get("v") ?? "1";
  const relays = parsed.searchParams.getAll("relay");

  if (!HEX_64.test(sourcePubkey) || !HEX_64.test(secretHex)) {
    throw new Error("The pairing link contains invalid key material.");
  }
  if (secretHex === "0".repeat(64)) {
    throw new Error("The pairing link contains an invalid session secret.");
  }
  if (version !== "1" || relays.length === 0) {
    throw new Error("This pairing link version is not supported.");
  }

  const relay = new URL(relays[0]);
  if (relay.protocol !== "wss:" && relay.protocol !== "ws:") {
    throw new Error("The pairing link contains an invalid Relay URL.");
  }

  return {
    sourcePubkey,
    sessionSecret: hexToBytes(secretHex),
    relay: relay.toString(),
  };
}

async function hkdf(
  input: Uint8Array,
  salt: Uint8Array,
  info: string,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(input).buffer,
    "HKDF",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: Uint8Array.from(salt).buffer,
      info: Uint8Array.from(textEncoder.encode(info)).buffer,
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function derivePairingProofs(
  privateKey: Uint8Array,
  qr: PairingQrPayload,
  targetPubkey: string,
): Promise<{ sasCode: string; sessionId: string; transcriptHash: string }> {
  const sessionId = await hkdf(
    qr.sessionSecret,
    new Uint8Array(),
    "nostr-pair-session-id",
  );
  // NIP-AB derives SAS from the raw secp256k1 ECDH X coordinate. Do not use
  // nip44.getConversationKey here: that value has already been HKDF-extracted
  // with the `nip44-v2` salt and therefore cannot interoperate with buzz-core.
  const compressedSourcePubkey = new Uint8Array(33);
  compressedSourcePubkey[0] = 2;
  compressedSourcePubkey.set(hexToBytes(qr.sourcePubkey), 1);
  const sharedX = secp256k1
    .getSharedSecret(privateKey, compressedSourcePubkey)
    .subarray(1, 33);
  const sasInput = await hkdf(sharedX, qr.sessionSecret, "nostr-pair-sas-v1");
  const code =
    (((sasInput[0] << 24) |
      (sasInput[1] << 16) |
      (sasInput[2] << 8) |
      sasInput[3]) >>>
      0) %
    1_000_000;
  const transcript = new Uint8Array(128);
  transcript.set(sessionId, 0);
  transcript.set(hexToBytes(qr.sourcePubkey), 32);
  transcript.set(hexToBytes(targetPubkey), 64);
  transcript.set(sasInput, 96);
  const transcriptHash = await hkdf(
    transcript,
    qr.sessionSecret,
    "nostr-pair-transcript-v1",
  );

  return {
    sasCode: code.toString().padStart(6, "0"),
    sessionId: bytesToHex(sessionId),
    transcriptHash: bytesToHex(transcriptHash),
  };
}
