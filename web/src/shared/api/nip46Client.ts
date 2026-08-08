import { finalizeEvent, getPublicKey, nip44, verifyEvent } from "nostr-tools";

import type { SignedNostrEvent, UnsignedNostrEvent } from "../lib/nostr-signer";

const NOSTR_CONNECT_KIND = 24_133;
const REQUEST_TIMEOUT_MS = 10_000;

type RpcResponse = {
  id: string;
  result?: string;
  error?: string;
};

type PendingRequest = {
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  timeout: number;
};

export type BunkerConnection = {
  clientSecretKey: Uint8Array;
  relayUrl: string;
  remoteSignerPubkey: string;
  secret: string;
};

export function parseBunkerUri(
  uri: string,
  clientSecretKey: Uint8Array,
): BunkerConnection {
  const parsed = new URL(uri);
  if (parsed.protocol !== "bunker:") {
    throw new Error("Desktop did not provide a bunker connection.");
  }
  const remoteSignerPubkey =
    parsed.hostname || parsed.pathname.replace(/^\/\//, "");
  const relayUrl = parsed.searchParams.get("relay");
  const secret = parsed.searchParams.get("secret");
  if (!/^[0-9a-f]{64}$/.test(remoteSignerPubkey) || !relayUrl || !secret) {
    throw new Error("Desktop provided an incomplete signer connection.");
  }
  return { clientSecretKey, relayUrl, remoteSignerPubkey, secret };
}

export class Nip46Client {
  private socket?: WebSocket;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly clientPubkey: string;
  private readonly conversationKey: Uint8Array;

  constructor(private readonly connection: BunkerConnection) {
    this.clientPubkey = getPublicKey(connection.clientSecretKey);
    this.conversationKey = nip44.v2.utils.getConversationKey(
      connection.clientSecretKey,
      connection.remoteSignerPubkey,
    );
  }

  async connect(): Promise<string> {
    await this.openSocket();
    const result = await this.request("connect", [
      this.connection.remoteSignerPubkey,
      this.connection.secret,
      "sign_event:22242,sign_event:27235",
      JSON.stringify({ name: "Buzz Web", url: window.location.origin }),
    ]);
    if (result !== "ack" && result !== this.connection.secret) {
      throw new Error("Desktop rejected the signer connection.");
    }
    return this.getPublicKey();
  }

  getPublicKey(): Promise<string> {
    return this.request("get_public_key", []);
  }

  async signEvent(event: UnsignedNostrEvent): Promise<SignedNostrEvent> {
    const result = await this.request("sign_event", [JSON.stringify(event)]);
    const signed = JSON.parse(result) as SignedNostrEvent;
    if (!verifyEvent(signed) || signed.pubkey !== (await this.getPublicKey())) {
      throw new Error("Desktop returned an invalid signed event.");
    }
    return signed;
  }

  close(): void {
    this.socket?.close();
    this.socket = undefined;
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timeout);
      pending.reject(new Error("Remote signer connection closed."));
    }
    this.pending.clear();
  }

  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.connection.relayUrl);
      this.socket = socket;
      socket.addEventListener("open", () => {
        socket.send(
          JSON.stringify([
            "REQ",
            "nip46",
            { kinds: [NOSTR_CONNECT_KIND], "#p": [this.clientPubkey] },
          ]),
        );
        resolve();
      });
      socket.addEventListener("message", (event) => this.handleMessage(event));
      socket.addEventListener("error", () =>
        reject(new Error("Could not reach the Desktop signer relay.")),
      );
      socket.addEventListener("close", () => this.close());
    });
  }

  private request(method: string, params: string[]): Promise<string> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Remote signer is offline."));
    }
    const id = crypto.randomUUID();
    const content = nip44.v2.encrypt(
      JSON.stringify({ id, method, params }),
      this.conversationKey,
    );
    const event = finalizeEvent(
      {
        kind: NOSTR_CONNECT_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", this.connection.remoteSignerPubkey]],
        content,
      },
      this.connection.clientSecretKey,
    );
    socket.send(JSON.stringify(["EVENT", event]));
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Desktop did not answer ${method}.`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timeout });
    });
  }

  private handleMessage(message: MessageEvent): void {
    try {
      const frame = JSON.parse(String(message.data));
      if (
        !Array.isArray(frame) ||
        frame[0] !== "EVENT" ||
        frame[1] !== "nip46"
      ) {
        return;
      }
      const event = frame[2];
      if (
        event.kind !== NOSTR_CONNECT_KIND ||
        event.pubkey !== this.connection.remoteSignerPubkey ||
        !verifyEvent(event) ||
        !event.tags.some(
          (tag: string[]) => tag[0] === "p" && tag[1] === this.clientPubkey,
        )
      ) {
        return;
      }
      const response = JSON.parse(
        nip44.v2.decrypt(event.content, this.conversationKey),
      ) as RpcResponse;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      window.clearTimeout(pending.timeout);
      if (response.error) pending.reject(new Error(response.error));
      else if (typeof response.result === "string")
        pending.resolve(response.result);
      else
        pending.reject(new Error("Desktop returned an empty signer response."));
    } catch {
      // Invalid, spoofed, or undecryptable events are ignored.
    }
  }
}
