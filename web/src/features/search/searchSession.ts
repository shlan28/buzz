import { parseMessage } from "@/features/channels/eventCodec";
import type { Channel, Message } from "@/features/channels/types";
import type { ProfileLookup } from "@/features/profile/types";
import { profileLabel } from "@/features/profile/eventCodec";
import { MESSAGE_KINDS } from "@/shared/domain/eventKinds";
import { queryRelayHttp } from "@/shared/api/relayHttp";
import { openPairedSigner } from "@/shared/api/signer";
import { relayHttpBaseUrl } from "@/shared/lib/relay-url";
import type { WebSearchResult } from "./types";
import type { NostrFilter } from "@/shared/lib/nostr-client";

export const MIN_RELAY_SEARCH_LENGTH = 2;
export const MAX_SEARCH_LENGTH = 160;

export function searchLocalEntities(
  rawQuery: string,
  channels: Channel[],
  profiles: ProfileLookup,
  currentPubkey: string,
): WebSearchResult[] {
  const query = normalizeSearchQuery(rawQuery).toLocaleLowerCase();
  if (!query) return [];
  const channelResults = channels
    .filter((channel) =>
      [channel.displayName, channel.name, channel.about].some((value) =>
        value.toLocaleLowerCase().includes(query),
      ),
    )
    .slice(0, 8)
    .map((channel): WebSearchResult => ({ kind: "channel", channel }));
  const visiblePubkeys = new Set(
    channels.flatMap((channel) =>
      channel.participantPubkeys.map((pubkey) => pubkey.toLowerCase()),
    ),
  );
  const personResults = Object.values(profiles)
    .filter(
      (profile) =>
        profile.pubkey !== currentPubkey.toLowerCase() &&
        visiblePubkeys.has(profile.pubkey) &&
        [
          profile.displayName,
          profile.name,
          profile.nip05Handle,
          profileLabel(profile, profile.pubkey),
        ].some((value) => value?.toLocaleLowerCase().includes(query)),
    )
    .slice(0, 8)
    .map((profile): WebSearchResult => ({ kind: "person", profile }));
  return [...channelResults, ...personResults];
}

export async function searchRelayMessages(
  rawQuery: string,
  accessibleChannelIds: string[],
): Promise<Message[]> {
  const query = normalizeSearchQuery(rawQuery);
  if (query.length < MIN_RELAY_SEARCH_LENGTH) return [];
  if (import.meta.env.MODE === "e2e" && window.__BUZZ_E2E_SEARCH_MESSAGES__) {
    const needle = query.toLocaleLowerCase();
    return window.__BUZZ_E2E_SEARCH_MESSAGES__.filter(
      (message) =>
        accessibleChannelIds.includes(message.channelId) &&
        message.content.toLocaleLowerCase().includes(needle),
    );
  }
  const signer = await openPairedSigner();
  const events = await queryRelayHttp(relayHttpBaseUrl(), signer, [
    buildMessageSearchFilter(query),
  ]);
  const accessible = new Set(accessibleChannelIds);
  return events
    .map(parseMessage)
    .filter((message): message is Message =>
      Boolean(message && accessible.has(message.channelId)),
    );
}

export async function loadSearchMessageById(
  eventId: string,
  accessibleChannelIds: string[],
): Promise<Message | null> {
  if (import.meta.env.MODE === "e2e" && window.__BUZZ_E2E_SEARCH_MESSAGES__) {
    return (
      window.__BUZZ_E2E_SEARCH_MESSAGES__.find(
        (message) =>
          message.id === eventId &&
          accessibleChannelIds.includes(message.channelId),
      ) ?? null
    );
  }
  const signer = await openPairedSigner();
  const events = await queryRelayHttp(relayHttpBaseUrl(), signer, [
    { ids: [eventId], kinds: [...MESSAGE_KINDS], limit: 1 },
  ]);
  const parsed = events[0] ? parseMessage(events[0]) : null;
  return parsed && accessibleChannelIds.includes(parsed.channelId)
    ? parsed
    : null;
}

export function normalizeSearchQuery(rawQuery: string) {
  return rawQuery.trim().replace(/\s+/g, " ").slice(0, MAX_SEARCH_LENGTH);
}

export function buildMessageSearchFilter(query: string): NostrFilter {
  return {
    kinds: [...MESSAGE_KINDS],
    search: normalizeSearchQuery(query),
    search_mode: "fulltext",
    page: 0,
    per_page: 30,
    limit: 30,
  };
}
