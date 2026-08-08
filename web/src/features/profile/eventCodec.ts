import type { NostrEvent } from "@/shared/lib/nostr-client";
import { truncatePubkey } from "@/shared/lib/pubkey";
import type { ProfileLookup, UserProfile } from "./types";

export function parseProfile(event: NostrEvent): UserProfile | null {
  if (event.kind !== 0) return null;
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(event.content) as Record<string, unknown>;
  } catch {
    return null;
  }
  const text = (key: string) =>
    typeof value[key] === "string" ? (value[key] as string) : null;
  return {
    pubkey: event.pubkey.toLowerCase(),
    displayName: text("display_name"),
    name: text("name"),
    avatarUrl: text("picture"),
    nip05Handle: text("nip05"),
    // Presentation-only hint. Relay/Desktop verification remains authoritative
    // for ownership and permissions; Web grants no capability from this flag.
    isAgent: event.tags.some((tag) => tag[0] === "auth" && tag.length === 4),
    updatedAt: event.created_at,
  };
}

export function buildProfileLookup(events: NostrEvent[]): ProfileLookup {
  const profiles: ProfileLookup = {};
  for (const event of events) {
    const profile = parseProfile(event);
    if (!profile) continue;
    const previous = profiles[profile.pubkey];
    if (!previous || previous.updatedAt < profile.updatedAt)
      profiles[profile.pubkey] = profile;
  }
  return profiles;
}

export function profileLabel(profile: UserProfile | undefined, pubkey: string) {
  return (
    profile?.displayName?.trim() ||
    profile?.name?.trim() ||
    profile?.nip05Handle?.trim() ||
    truncatePubkey(pubkey)
  );
}
