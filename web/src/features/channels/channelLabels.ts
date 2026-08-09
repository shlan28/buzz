import { profileLabel } from "@/features/profile/eventCodec";
import type { ProfileLookup } from "@/features/profile/types";
import type { Channel } from "./types";

const GENERIC_DM = /^(?:dm|direct messages?|group dm(?: \(\d+\))?)$/i;

export function channelDisplayName(
  channel: Channel,
  currentPubkey: string,
  profiles: ProfileLookup,
) {
  if (channel.channelType !== "dm" || !GENERIC_DM.test(channel.name.trim()))
    return channel.name;
  const others = channel.participantPubkeys.filter(
    (pubkey) => pubkey.toLowerCase() !== currentPubkey.toLowerCase(),
  );
  const visible = others.length ? others : channel.participantPubkeys;
  return visible.length
    ? visible
        .map((pubkey) => profileLabel(profiles[pubkey.toLowerCase()], pubkey))
        .join(", ")
    : channel.name;
}
