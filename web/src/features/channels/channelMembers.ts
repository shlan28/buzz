import { profileLabel } from "@/features/profile/eventCodec";
import type { ProfileLookup } from "@/features/profile/types";
import type { ChannelMember, ChannelMemberRole } from "./types";

export type ChannelMemberView = ChannelMember & {
  label: string;
  avatarUrl?: string | null;
  isAgent: boolean;
  isCurrentUser: boolean;
};

const roleOrder: Record<ChannelMemberRole, number> = {
  owner: 0,
  admin: 1,
  member: 2,
  guest: 3,
  bot: 4,
};

export function buildChannelMemberViews(input: {
  members: ChannelMember[];
  profiles: ProfileLookup;
  currentPubkey: string;
  query?: string;
}): ChannelMemberView[] {
  const currentPubkey = input.currentPubkey.toLowerCase();
  const query = input.query?.trim().toLowerCase() ?? "";
  const deduplicated = new Map<string, ChannelMember>();
  for (const member of input.members) {
    const pubkey = member.pubkey.toLowerCase();
    if (/^[0-9a-f]{64}$/.test(pubkey))
      deduplicated.set(pubkey, { ...member, pubkey });
  }
  return [...deduplicated.values()]
    .map((member) => {
      const profile = input.profiles[member.pubkey];
      const isCurrentUser = member.pubkey === currentPubkey;
      return {
        ...member,
        label: isCurrentUser ? "You" : profileLabel(profile, member.pubkey),
        avatarUrl: profile?.avatarUrl,
        isAgent: profile?.isAgent === true || member.role === "bot",
        isCurrentUser,
      };
    })
    .filter((member) => {
      if (!query) return true;
      const profile = input.profiles[member.pubkey];
      return [
        member.label,
        member.pubkey,
        member.role,
        member.isAgent ? "agent" : "person",
        profile?.displayName,
        profile?.name,
        profile?.nip05Handle,
      ].some((value) => value?.toLowerCase().includes(query));
    })
    .sort(
      (left, right) =>
        roleOrder[left.role] - roleOrder[right.role] ||
        Number(right.isCurrentUser) - Number(left.isCurrentUser) ||
        left.label.localeCompare(right.label),
    );
}
