import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip44,
  verifyEvent,
} from "nostr-tools";

import { derivePairingProofs, parsePairingUri } from "./pairingCrypto";
import type {
  PairingMessage,
  PairingViewState,
  RemoteSignerConnection,
} from "./types";

const PAIRING_KIND = 24134;
export const OFFER_RETRY_INTERVAL_MS = 2_000;
export const MAX_OFFER_ATTEMPTS = 5;
const HEARTBEAT_INTERVAL_MS = 15_000;
const RECONNECT_DELAY_MS = 750;
const SESSION_LIFETIME_MS = 10 * 60 * 1_000;

export function shouldRetryPairingOffer(
  attempts: number,
  desktopVerified: boolean,
  now: number,
  expiresAt: number,
): boolean {
  return !desktopVerified && attempts < MAX_OFFER_ATTEMPTS && now < expiresAt;
}

export class WebPairingSession {
  private readonly privateKey = generateSecretKey();
  private readonly pubkey = getPublicKey(this.privateKey);
  private socket?: WebSocket;
  private sourcePubkey?: string;
  private conversationKey?: Uint8Array;
  private transcriptHash?: string;
  private hasVerifiedDesktop = false;
  private completed = false;
  private intentionallyClosed = false;
  private offerMessage?: Record<string, unknown>;
  private offerAttempts = 0;
  private expiresAt = 0;
  private retryTimer?: number;
  private heartbeatTimer?: number;
  private reconnectTimer?: number;
  private relayUrl?: string;
  private sasCode?: string;
  private readonly processedIds = new Set<string>();

  constructor(
    private readonly onState: (state: PairingViewState) => void,
    private readonly onComplete: (connection: RemoteSignerConnection) => void,
  ) {}

  async connect(uri: string): Promise<void> {
    this.close();
    this.intentionallyClosed = false;
    this.completed = false;
    this.hasVerifiedDesktop = false;
    this.offerAttempts = 0;
    this.expiresAt = Date.now() + SESSION_LIFETIME_MS;
    this.onState({ status: "connecting" });
    try {
      const qr = parsePairingUri(uri);
      this.relayUrl = qr.relay;
      this.sourcePubkey = qr.sourcePubkey;
      this.conversationKey = nip44.v2.utils.getConversationKey(
        this.privateKey,
        qr.sourcePubkey,
      );
      const proofs = await derivePairingProofs(
        this.privateKey,
        qr,
        this.pubkey,
      );
      this.transcriptHash = proofs.transcriptHash;
      this.sasCode = proofs.sasCode;
      this.offerMessage = {
        type: "offer",
        version: 1,
        session_id: proofs.sessionId,
      };
      await this.openSocket(false, proofs.sasCode);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "Pairing failed.");
    }
  }

  confirmSas(): void {
    if (!this.hasVerifiedDesktop) {
      this.onState({
        status: "confirming-sas",
        errorMessage: "Confirm the code on the Mac first.",
      });
      return;
    }
    this.onState({ status: "transferring" });
  }

  denySas(): void {
    this.publish({ type: "abort", reason: "user_denied" });
    this.fail("Pairing cancelled.");
  }

  close(): void {
    this.intentionallyClosed = true;
    this.clearTimers();
    this.socket?.close();
    this.socket = undefined;
    this.processedIds.clear();
  }

  private publish(message: Record<string, unknown>): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(this.createEventFrame(message));
  }

  private createEventFrame(message: Record<string, unknown>): string {
    if (!this.sourcePubkey || !this.conversationKey) return "";
    const content = nip44.v2.encrypt(
      JSON.stringify(message),
      this.conversationKey,
    );
    const event = finalizeEvent(
      {
        kind: PAIRING_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", this.sourcePubkey]],
        content,
      },
      this.privateKey,
    );
    return JSON.stringify(["EVENT", event]);
  }

  private async openSocket(
    reconnecting: boolean,
    sasCode: string,
  ): Promise<void> {
    if (!this.relayUrl) throw new Error("Pairing Relay URL is missing.");
    const socket = new WebSocket(this.relayUrl);
    this.socket = socket;
    socket.addEventListener("message", (event) => this.handleMessage(event));
    socket.addEventListener("close", () => this.handleSocketClose(socket));
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("Could not connect to the pairing Relay.")),
        { once: true },
      );
    });
    socket.send(
      JSON.stringify([
        "REQ",
        "web-pair",
        { kinds: [PAIRING_KIND], "#p": [this.pubkey] },
      ]),
    );
    if (reconnecting) this.offerAttempts = 0;
    this.sendOffer();
    this.startHeartbeat();
    this.onState({
      status: "confirming-sas",
      sasCode,
      errorMessage: reconnecting ? "Connection restored." : undefined,
    });
  }

  private sendOffer(): void {
    if (
      !shouldRetryPairingOffer(
        this.offerAttempts,
        this.hasVerifiedDesktop,
        Date.now(),
        this.expiresAt,
      ) ||
      !this.offerMessage ||
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    )
      return;
    // Re-sign each retry so the Relay freshness window remains valid while the
    // logical session id, browser key, and resulting SAS stay unchanged.
    this.socket.send(this.createEventFrame(this.offerMessage));
    this.offerAttempts += 1;
    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(
      () => this.sendOffer(),
      OFFER_RETRY_INTERVAL_MS,
    );
  }

  private startHeartbeat(): void {
    window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = window.setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN)
        this.socket.send('["PING"]');
    }, HEARTBEAT_INTERVAL_MS);
  }

  private handleSocketClose(socket: WebSocket): void {
    if (this.socket !== socket || this.intentionallyClosed || this.completed)
      return;
    this.clearTimers();
    if (Date.now() >= this.expiresAt) {
      this.fail("The pairing link expired. Create a new code and retry.");
      return;
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    this.onState({
      status: "reconnecting",
      errorMessage: "Restoring the pairing connection…",
    });
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => {
      void this.openSocket(true, this.sasCode ?? "------").catch(() => {
        if (!this.intentionallyClosed && !this.completed)
          this.scheduleReconnect();
      });
    }, RECONNECT_DELAY_MS);
  }

  private clearTimers(): void {
    window.clearTimeout(this.retryTimer);
    window.clearTimeout(this.reconnectTimer);
    window.clearInterval(this.heartbeatTimer);
  }

  private handleMessage(messageEvent: MessageEvent): void {
    try {
      const frame = JSON.parse(String(messageEvent.data));
      if (!Array.isArray(frame) || frame[0] !== "EVENT") return;
      const event = frame[2];
      if (
        !event ||
        event.kind !== PAIRING_KIND ||
        event.pubkey !== this.sourcePubkey ||
        this.processedIds.has(event.id) ||
        !verifyEvent(event) ||
        !event.tags.some(
          (tag: string[]) => tag[0] === "p" && tag[1] === this.pubkey,
        )
      ) {
        return;
      }
      const plaintext = nip44.v2.decrypt(
        event.content,
        this.conversationKey as Uint8Array,
      );
      const message = JSON.parse(plaintext) as PairingMessage;
      this.processedIds.add(event.id);

      if (message.type === "sas-confirm") {
        if (message.transcript_hash !== this.transcriptHash) {
          this.publish({ type: "abort", reason: "sas_mismatch" });
          this.fail("Security verification failed. Pairing was aborted.");
          return;
        }
        this.hasVerifiedDesktop = true;
        window.clearTimeout(this.retryTimer);
        return;
      }
      if (message.type === "abort") {
        this.fail(`The Mac cancelled pairing: ${message.reason}`);
        return;
      }
      if (message.type === "payload") {
        if (!this.hasVerifiedDesktop) return;
        if (
          message.payload_type !== "bunker" &&
          message.payload_type !== "connect"
        ) {
          this.publish({ type: "complete", success: false });
          this.fail(
            "This Mac tried to send a user private key. Update Buzz Desktop to the Web pairing version.",
          );
          return;
        }
        const connection = {
          type: message.payload_type,
          uri: message.payload,
          clientSecretKey: this.privateKey.slice(),
        } as RemoteSignerConnection;
        this.publish({ type: "complete", success: true });
        this.completed = true;
        this.clearTimers();
        this.onComplete(connection);
      }
    } catch {
      // Invalid and undecryptable relay events are discarded by design.
    }
  }

  private fail(errorMessage: string): void {
    this.close();
    this.onState({ status: "error", errorMessage });
  }
}
