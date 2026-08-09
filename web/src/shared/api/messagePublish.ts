import { publishSignedEvent } from "./publishSignedEvent";
import type { UnsignedNostrEvent } from "@/shared/lib/nostr-signer";

export function buildUnsignedChannelMessage(input: {
  channelId: string;
  content: string;
  mentionPubkeys?: string[];
  createdAt?: number;
  clientId?: string;
}): UnsignedNostrEvent {
  const content = input.content.trim();
  if (!content) throw new Error("Message cannot be empty.");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.channelId,
    )
  ) {
    throw new Error("This conversation has an invalid channel id.");
  }
  const mentions = [...new Set(input.mentionPubkeys ?? [])];
  if (mentions.some((pubkey) => !/^[0-9a-f]{64}$/.test(pubkey))) {
    throw new Error("A message recipient has an invalid public key.");
  }
  return {
    kind: 9,
    created_at: input.createdAt ?? Math.floor(Date.now() / 1000),
    tags: [
      ["h", input.channelId],
      ...mentions.map((pubkey) => ["p", pubkey]),
      ["client", input.clientId ?? crypto.randomUUID()],
    ],
    content,
  };
}

export async function publishChannelMessage(input: {
  channelId: string;
  content: string;
  mentionPubkeys?: string[];
}): Promise<string> {
  if (
    import.meta.env.MODE === "e2e" &&
    window.__BUZZ_E2E_PUBLISH_CHANNEL_MESSAGE__
  ) {
    return window.__BUZZ_E2E_PUBLISH_CHANNEL_MESSAGE__(input);
  }
  const unsigned = buildUnsignedChannelMessage(input);
  return (await publishSignedEvent(unsigned)).eventId;
}
