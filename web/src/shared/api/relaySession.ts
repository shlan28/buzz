import { makeAuthEvent } from "nostr-tools/nip42";
import { verifyEvent } from "nostr-tools/pure";
import type { NostrEvent, NostrFilter } from "@/shared/lib/nostr-client";
import type { PairedSigner } from "./signer";

const TIMEOUT_MS = 12_000;

export async function queryRelay(
  relayUrl: string,
  signer: PairedSigner,
  filters: NostrFilter[],
): Promise<NostrEvent[]> {
  if (filters.length === 0 || filters.some((filter) => !filter.kinds?.length)) {
    throw new Error("Every Relay query must declare event kinds.");
  }
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(relayUrl);
    const subscriptionId = `web-${crypto.randomUUID()}`;
    const events = new Map<string, NostrEvent>();
    let authId: string | undefined;
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      socket.close();
      if (error) reject(error);
      else
        resolve(
          [...events.values()].sort((a, b) => a.created_at - b.created_at),
        );
    };
    const timeout = window.setTimeout(
      () => finish(new Error("Relay did not finish the query in time.")),
      TIMEOUT_MS,
    );
    socket.addEventListener("message", async ({ data }) => {
      let frame: unknown;
      try {
        frame = JSON.parse(String(data));
      } catch {
        return;
      }
      if (!Array.isArray(frame)) return;
      if (frame[0] === "AUTH" && typeof frame[1] === "string") {
        try {
          const signed = await signer.signEvent(
            makeAuthEvent(relayUrl, frame[1]),
          );
          authId = signed.id;
          socket.send(JSON.stringify(["AUTH", signed]));
        } catch (error) {
          finish(
            error instanceof Error
              ? error
              : new Error("Relay authentication failed."),
          );
        }
      } else if (frame[0] === "OK" && frame[1] === authId) {
        if (frame[2] !== true)
          finish(
            new Error(String(frame[3] ?? "Relay rejected authentication.")),
          );
        else socket.send(JSON.stringify(["REQ", subscriptionId, ...filters]));
      } else if (frame[0] === "EVENT" && frame[1] === subscriptionId) {
        const event = frame[2] as NostrEvent;
        if (event && verifyEvent(event)) events.set(event.id, event);
      } else if (frame[0] === "EOSE" && frame[1] === subscriptionId) {
        socket.send(JSON.stringify(["CLOSE", subscriptionId]));
        finish();
      } else if (frame[0] === "CLOSED" && frame[1] === subscriptionId) {
        finish(new Error(String(frame[2] ?? "Relay closed the query.")));
      }
    });
    socket.addEventListener("error", () =>
      finish(new Error("Could not connect to the Buzz Relay.")),
    );
    socket.addEventListener("close", () => {
      if (!finished)
        finish(new Error("Relay disconnected before returning data."));
    });
  });
}
