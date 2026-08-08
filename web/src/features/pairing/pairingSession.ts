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

export class WebPairingSession {
  private readonly privateKey = generateSecretKey();
  private readonly pubkey = getPublicKey(this.privateKey);
  private socket?: WebSocket;
  private sourcePubkey?: string;
  private conversationKey?: Uint8Array;
  private transcriptHash?: string;
  private hasVerifiedDesktop = false;
  private readonly processedIds = new Set<string>();

  constructor(
    private readonly onState: (state: PairingViewState) => void,
    private readonly onComplete: (connection: RemoteSignerConnection) => void,
  ) {}

  async connect(uri: string): Promise<void> {
    this.close();
    this.onState({ status: "connecting" });
    try {
      const qr = parsePairingUri(uri);
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

      const socket = new WebSocket(qr.relay);
      this.socket = socket;
      socket.addEventListener("message", (event) => this.handleMessage(event));
      socket.addEventListener("close", () => {
        if (!this.hasVerifiedDesktop) {
          this.fail(
            "The pairing Relay disconnected. Create a new code and retry.",
          );
        }
      });
      socket.addEventListener("error", () =>
        this.fail("Could not connect to the pairing Relay."),
      );
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener("open", () => resolve(), { once: true });
        socket.addEventListener("error", () => reject(), { once: true });
      });
      socket.send(
        JSON.stringify([
          "REQ",
          "web-pair",
          { kinds: [PAIRING_KIND], "#p": [this.pubkey] },
        ]),
      );
      this.publish({ type: "offer", version: 1, session_id: proofs.sessionId });
      this.onState({ status: "confirming-sas", sasCode: proofs.sasCode });
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
    this.socket?.close();
    this.socket = undefined;
    this.processedIds.clear();
  }

  private publish(message: Record<string, unknown>): void {
    if (!this.socket || !this.sourcePubkey || !this.conversationKey) {
      return;
    }
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
    this.socket.send(JSON.stringify(["EVENT", event]));
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
        } as RemoteSignerConnection;
        this.publish({ type: "complete", success: true });
        this.onComplete(connection);
        this.onState({ status: "success" });
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
