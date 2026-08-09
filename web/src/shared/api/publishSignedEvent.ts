import type { UnsignedNostrEvent } from "@/shared/lib/nostr-signer";
import { relayHttpBaseUrl } from "@/shared/lib/relay-url";
import { makePairedNip98AuthHeader } from "./relayHttp";
import { openPairedSigner } from "./signer";

export async function publishSignedEvent(
  unsigned: UnsignedNostrEvent,
): Promise<{ eventId: string; message?: string }> {
  const signer = await openPairedSigner();
  try {
    const event = await signer.signEvent(unsigned);
    const url = `${relayHttpBaseUrl().replace(/\/$/, "")}/events`;
    const body = JSON.stringify(event);
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
        payload && typeof payload === "object"
          ? ((payload as Record<string, unknown>).error ??
            (payload as Record<string, unknown>).message)
          : undefined;
      throw new Error(
        typeof message === "string"
          ? message
          : `Relay rejected the event (${response.status}).`,
      );
    }
    const message =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>).message
        : undefined;
    return {
      eventId: event.id,
      message: typeof message === "string" ? message : undefined,
    };
  } finally {
    signer.close();
  }
}
