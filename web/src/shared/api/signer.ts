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

export async function openPairedSigner(): Promise<PairedSigner> {
  const credential = await loadRemoteSignerCredential();
  if (!credential) throw new Error("PAIR_REQUIRED");
  const client = new Nip46Client({
    clientSecretKey: credential.clientSecretKey,
    relayUrl: credential.relayUrl,
    remoteSignerPubkey: credential.remoteSignerPubkey,
  });
  await client.open();
  const userPubkey = await client.getPublicKey();
  if (userPubkey !== credential.userPubkey) {
    client.close();
    await clearRemoteSignerCredential();
    throw new Error("Desktop signer identity changed. Pair this device again.");
  }
  return {
    userPubkey,
    signEvent: (event) => client.signEvent(event),
    close: () => client.close(),
  };
}
