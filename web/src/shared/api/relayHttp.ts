import { verifyEvent } from "nostr-tools/pure";
import type { NostrEvent, NostrFilter } from "@/shared/lib/nostr-client";
import type { PairedSigner } from "./signer";

export async function queryRelayHttp(
  relayHttpBaseUrl: string,
  signer: PairedSigner,
  filters: NostrFilter[],
): Promise<NostrEvent[]> {
  if (filters.length === 0 || filters.some((filter) => !filter.kinds?.length)) {
    throw new Error("Every Relay query must declare event kinds.");
  }
  const url = `${relayHttpBaseUrl.replace(/\/$/, "")}/query`;
  const body = JSON.stringify(filters);
  const authorization = await makePairedNip98AuthHeader(url, body, signer);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body,
  });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : `Relay query failed (${response.status}).`;
    throw new Error(message);
  }
  if (!Array.isArray(payload)) {
    throw new Error("Relay returned an invalid query response.");
  }
  return payload.filter(isVerifiedEvent);
}

export async function makePairedNip98AuthHeader(
  url: string,
  body: string,
  signer: PairedSigner,
): Promise<string> {
  const payloadDigest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(body),
  );
  const payloadHex = Array.from(new Uint8Array(payloadDigest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const event = await signer.signEvent({
    kind: 27_235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["u", url],
      ["method", "POST"],
      ["payload", payloadHex],
      ["nonce", crypto.randomUUID()],
    ],
    content: "",
  });
  return `Nostr ${btoa(JSON.stringify(event))}`;
}

function isVerifiedEvent(value: unknown): value is NostrEvent {
  return Boolean(
    value && typeof value === "object" && verifyEvent(value as NostrEvent),
  );
}
