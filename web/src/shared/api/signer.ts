import type { UnsignedNostrEvent } from "@/shared/lib/nostr-signer";
import {
  clearRemoteSignerCredential,
  loadRemoteSignerCredential,
} from "@/shared/storage/deviceCredentials";
import { Nip46Client } from "./nip46Client";

export type PairedSigner = {
  userPubkey: string;
  signEvent: (
    event: UnsignedNostrEvent,
  ) => ReturnType<Nip46Client["signEvent"]>;
  close: () => void;
};

type SharedSigner = {
  client: Nip46Client;
  credentialFingerprint: string;
  userPubkey: string;
};

let sharedSignerPromise: Promise<SharedSigner> | undefined;

function credentialFingerprint(credential: {
  clientSecretKey: Uint8Array;
  relayUrl: string;
  remoteSignerPubkey: string;
}) {
  return `${credential.relayUrl}|${credential.remoteSignerPubkey}|${Array.from(credential.clientSecretKey).join(",")}`;
}

export function resetPairedSignerSession(): void {
  const pending = sharedSignerPromise;
  sharedSignerPromise = undefined;
  void pending?.then(({ client }) => client.close()).catch(() => undefined);
}

export async function openPairedSigner(): Promise<PairedSigner> {
  const credential = await loadRemoteSignerCredential();
  if (!credential) throw new Error("PAIR_REQUIRED");
  const fingerprint = credentialFingerprint(credential);
  if (!sharedSignerPromise) {
    sharedSignerPromise = (async () => {
      const client = new Nip46Client({
        clientSecretKey: credential.clientSecretKey,
        relayUrl: credential.relayUrl,
        remoteSignerPubkey: credential.remoteSignerPubkey,
      });
      try {
        await client.open();
        const userPubkey = await client.getPublicKey();
        return { client, credentialFingerprint: fingerprint, userPubkey };
      } catch (error) {
        client.close();
        sharedSignerPromise = undefined;
        throw error;
      }
    })();
  }
  let shared = await sharedSignerPromise;
  if (shared.credentialFingerprint !== fingerprint) {
    resetPairedSignerSession();
    return openPairedSigner();
  }
  await shared.client.open();
  const userPubkey = await shared.client.getPublicKey();
  if (userPubkey !== credential.userPubkey) {
    resetPairedSignerSession();
    await clearRemoteSignerCredential();
    throw new Error("Desktop signer identity changed. Pair this device again.");
  }
  shared = { ...shared, userPubkey };
  return {
    userPubkey,
    signEvent: (event) => shared.client.signEvent(event),
    close: () => undefined,
  };
}
