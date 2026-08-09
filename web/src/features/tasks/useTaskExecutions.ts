import { makeAuthEvent } from "nostr-tools/nip42";
import { verifyEvent } from "nostr-tools/pure";
import { useCallback, useEffect, useMemo, useState } from "react";
import { openPairedSigner } from "@/shared/api/signer";
import { KINDS } from "@/shared/domain/eventKinds";
import { relayWsUrl } from "@/shared/lib/relay-url";
import type { NostrEvent } from "@/shared/lib/nostr-client";
import { latestTaskExecutions, parseTaskExecution } from "./eventCodec";
import type { TaskExecution } from "./types";

export function useTaskExecutions(
  initial: TaskExecution[],
  relaySelfPubkey: string,
) {
  const [executions, setExecutions] = useState(() =>
    latestTaskExecutions(initial),
  );
  const [statusAvailable, setStatusAvailable] = useState(true);
  useEffect(() => setExecutions(latestTaskExecutions(initial)), [initial]);
  useEffect(() => {
    if (import.meta.env.MODE === "e2e") return;
    let disposed = false;
    let socket: WebSocket | undefined;
    let retry: number | undefined;
    const connect = async () => {
      try {
        const signer = await openPairedSigner();
        if (disposed) {
          signer.close();
          return;
        }
        const relayUrl = relayWsUrl();
        socket = new WebSocket(relayUrl);
        const subscriptionId = `task-executions-${crypto.randomUUID()}`;
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
            const event = await signer.signEvent(
              makeAuthEvent(relayUrl, frame[1]),
            );
            authId = event.id;
            socket?.send(JSON.stringify(["AUTH", event]));
          } else if (frame[0] === "OK" && frame[1] === authId) {
            signer.close();
            if (frame[2] === true) {
              setStatusAvailable(true);
              socket?.send(
                JSON.stringify([
                  "REQ",
                  subscriptionId,
                  { kinds: [KINDS.taskExecutionState], limit: 0 },
                ]),
              );
            } else socket?.close();
          } else if (
            frame[0] === "EVENT" &&
            frame[1] === subscriptionId &&
            frame[2] &&
            verifyEvent(frame[2] as NostrEvent)
          ) {
            const execution = parseTaskExecution(
              frame[2] as NostrEvent,
              relaySelfPubkey,
            );
            if (execution) {
              setExecutions((current) =>
                latestTaskExecutions([...current.values(), execution]),
              );
            }
          }
        });
        socket.addEventListener("close", () => {
          signer.close();
          if (!disposed) {
            setStatusAvailable(false);
            retry = window.setTimeout(connect, 2_000);
          }
        });
        socket.addEventListener("error", () => socket?.close());
      } catch {
        if (!disposed) retry = window.setTimeout(connect, 2_000);
      }
    };
    void connect();
    return () => {
      disposed = true;
      if (retry) window.clearTimeout(retry);
      socket?.close();
    };
  }, [relaySelfPubkey]);
  const recordQueued = useCallback(
    (input: {
      executionId: string;
      taskId: string;
      assignee: string;
      requester: string;
    }) => {
      const execution: TaskExecution = {
        id: input.executionId,
        eventId: `accepted:${input.executionId}`,
        taskId: input.taskId,
        assignee: input.assignee,
        requester: input.requester,
        status: "queued",
        message: "",
        updatedAt: Math.floor(Date.now() / 1000),
      };
      setExecutions((current) =>
        latestTaskExecutions([...current.values(), execution]),
      );
    },
    [],
  );
  return useMemo(
    () => ({ executions, recordQueued, statusAvailable }),
    [executions, recordQueued, statusAvailable],
  );
}
