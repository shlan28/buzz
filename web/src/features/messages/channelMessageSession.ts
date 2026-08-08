import { makeAuthEvent } from "nostr-tools/nip42";
import { verifyEvent } from "nostr-tools/pure";
import { MESSAGE_KINDS } from "@/shared/domain/eventKinds";
import { relayWsUrl } from "@/shared/lib/relay-url";
import type { NostrEvent } from "@/shared/lib/nostr-client";
import { openPairedSigner } from "@/shared/api/signer";

export function subscribeChannelMessages(
  channelId: string,
  onEvent: (event: NostrEvent) => void,
) {
  let cancelled = false;
  let socket: WebSocket | undefined;
  let reconnectDelay = 500;
  let reconnectTimer: number | undefined;

  const connect = async () => {
    if (cancelled) return;
    const signer = await openPairedSigner();
    const relayUrl = relayWsUrl();
    const subscriptionId = `channel-${crypto.randomUUID()}`;
    socket = new WebSocket(relayUrl);
    let authId: string | undefined;
    socket.addEventListener("message", async ({ data }) => {
      let frame: unknown;
      try {
        frame = JSON.parse(String(data));
      } catch {
        return;
      }
      if (!Array.isArray(frame)) return;
      if (frame[0] === "AUTH" && typeof frame[1] === "string") {
        const signed = await signer.signEvent(
          makeAuthEvent(relayUrl, frame[1]),
        );
        if (cancelled || socket?.readyState !== WebSocket.OPEN) return;
        authId = signed.id;
        socket.send(JSON.stringify(["AUTH", signed]));
      } else if (
        frame[0] === "OK" &&
        frame[1] === authId &&
        frame[2] === true
      ) {
        reconnectDelay = 500;
        socket?.send(
          JSON.stringify([
            "REQ",
            subscriptionId,
            { kinds: MESSAGE_KINDS, "#h": [channelId] },
          ]),
        );
      } else if (frame[0] === "EVENT" && frame[1] === subscriptionId) {
        const event = frame[2] as NostrEvent;
        if (
          verifyEvent(event) &&
          MESSAGE_KINDS.includes(
            event.kind as (typeof MESSAGE_KINDS)[number],
          ) &&
          event.tags.some((tag) => tag[0] === "h" && tag[1] === channelId)
        ) {
          onEvent(event);
        }
      }
    });
    socket.addEventListener("close", () => {
      if (cancelled) return;
      reconnectTimer = window.setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 5_000);
        void connect();
      }, reconnectDelay);
    });
  };
  void connect();
  return () => {
    cancelled = true;
    if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
    socket?.close();
  };
}
