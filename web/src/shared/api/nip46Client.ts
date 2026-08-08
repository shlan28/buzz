import { finalizeEvent, getPublicKey, nip44, verifyEvent } from "nostr-tools";

import type { SignedNostrEvent, UnsignedNostrEvent } from "../lib/nostr-signer";

const NOSTR_CONNECT_KIND = 24_133;
const REQUEST_TIMEOUT_MS = 10_000;
export const SIGNER_HEARTBEAT_INTERVAL_MS = 25_000;

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
  secret?: string;
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
  private openPromise?: Promise<void>;
  private heartbeatTimer?: number;
  private manuallyClosed = false;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly clientPubkey: string;
  private readonly conversationKey: Uint8Array;
  private userPubkey?: string;

  constructor(private readonly connection: BunkerConnection) {
    this.clientPubkey = getPublicKey(connection.clientSecretKey);
    this.conversationKey = nip44.v2.utils.getConversationKey(
      connection.clientSecretKey,
      connection.remoteSignerPubkey,
    );
  }

  async connect(): Promise<string> {
    if (!this.connection.secret) {
      throw new Error(
        "The pairing secret is only available during first-time setup.",
      );
    }
    await this.open();
    const result = await this.request("connect", [
      this.connection.remoteSignerPubkey,
      this.connection.secret,
      "sign_event:9,sign_event:22242,sign_event:27235",
      JSON.stringify({ name: "Buzz Web", url: window.location.origin }),
    ]);
    if (result !== "ack" && result !== this.connection.secret) {
      throw new Error("Desktop rejected the signer connection.");
    }
    return this.getPublicKey();
  }

  async open(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) return;
    if (this.openPromise) return this.openPromise;
    this.manuallyClosed = false;
    this.openPromise = this.openSocket().finally(() => {
      this.openPromise = undefined;
    });
    return this.openPromise;
  }

  async getPublicKey(): Promise<string> {
    const pubkey = await this.retryReadRequest("get_public_key", []);
    if (!/^[0-9a-f]{64}$/.test(pubkey)) {
      throw new Error("Desktop returned an invalid user public key.");
    }
    this.userPubkey = pubkey;
    return pubkey;
  }

  async signEvent(event: UnsignedNostrEvent): Promise<SignedNostrEvent> {
    const result = await this.request("sign_event", [JSON.stringify(event)]);
    const signed = JSON.parse(result) as SignedNostrEvent;
    assertSignedEventMatches(
      event,
      signed,
      this.userPubkey ?? (await this.getPublicKey()),
    );
    return signed;
  }

  close(): void {
    this.manuallyClosed = true;
    this.stopHeartbeat();
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
    this.rejectPending(new Error("Remote signer connection closed."));
  }

  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.connection.relayUrl);
      let opened = false;
      this.socket = socket;
      socket.addEventListener("open", () => {
        if (socket !== this.socket) return;
        opened = true;
        socket.send(
          JSON.stringify([
            "REQ",
            "nip46",
            { kinds: [NOSTR_CONNECT_KIND], "#p": [this.clientPubkey] },
          ]),
        );
        this.startHeartbeat(socket);
        resolve();
      });
      socket.addEventListener("message", (event) => this.handleMessage(event));
      socket.addEventListener("error", () => {
        if (!opened)
          reject(new Error("Could not reach the Desktop signer relay."));
      });
      socket.addEventListener("close", () => {
        this.handleSocketClose(socket);
        if (!opened)
          reject(new Error("Could not reach the Desktop signer relay."));
      });
    });
  }

  private async retryReadRequest(
    method: "get_public_key",
    params: string[],
  ): Promise<string> {
    try {
      return await this.request(method, params);
    } catch (error) {
      if (this.manuallyClosed || !isSignerTransportError(error)) throw error;
      await this.open();
      return this.request(method, params);
    }
  }

  private startHeartbeat(socket: WebSocket): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      if (socket === this.socket && socket.readyState === WebSocket.OPEN) {
        socket.send('["PING"]');
      }
    }, SIGNER_HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== undefined) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private handleSocketClose(socket: WebSocket): void {
    if (socket !== this.socket) return;
    this.stopHeartbeat();
    this.socket = undefined;
    this.rejectPending(new Error("Remote signer connection closed."));
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
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

export function isSignerTransportError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === "Remote signer connection closed." ||
      error.message === "Remote signer is offline." ||
      error.message.startsWith("Desktop did not answer "))
  );
}

export function assertSignedEventMatches(
  expected: UnsignedNostrEvent,
  signed: SignedNostrEvent,
  expectedPubkey: string,
): void {
  if (
    !verifyEvent(signed) ||
    signed.pubkey !== expectedPubkey ||
    signed.kind !== expected.kind ||
    signed.created_at !== expected.created_at ||
    signed.content !== expected.content ||
    JSON.stringify(signed.tags) !== JSON.stringify(expected.tags)
  ) {
    throw new Error("Desktop returned an invalid signed event.");
  }
}
