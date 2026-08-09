import { Search, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { ProfileLookup } from "@/features/profile/types";
import { ProfileAvatar } from "@/shared/ui/ProfileAvatar";
import { buildChannelMemberViews } from "./channelMembers";
import type { ChannelMember } from "./types";

export function ChannelMembersPanel({
  currentPubkey,
  members,
  onClose,
  profiles,
}: {
  currentPubkey: string;
  members: ChannelMember[];
  onClose: () => void;
  profiles: ProfileLookup;
}) {
  const [query, setQuery] = useState("");
  const rows = useMemo(
    () => buildChannelMemberViews({ members, profiles, currentPubkey, query }),
    [currentPubkey, members, profiles, query],
  );
  return (
    <aside
      aria-label="Channel members"
      className="absolute inset-y-0 right-0 z-30 flex w-80 flex-col border-l border-border bg-background shadow-xl max-[700px]:w-full"
      data-testid="channel-members-panel"
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <Users className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Channel members</h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {members.length}
        </span>
        <button
          aria-label="Close channel members"
          className="ml-auto rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onClose}
          type="button"
        >
          <X className="size-4" />
        </button>
      </header>
      <div className="border-b border-border p-3">
        <label className="relative block">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            aria-label="Search channel members"
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people and agents"
            value={query}
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {rows.length ? (
          rows.map((member) => (
            <div
              className="flex items-center gap-3 border-b border-border/60 px-1 py-3 last:border-b-0"
              data-testid={`channel-member-${member.pubkey}`}
              key={member.pubkey}
            >
              <ProfileAvatar
                avatarUrl={member.avatarUrl}
                className="size-9"
                isAgent={member.isAgent}
                label={member.label}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{member.label}</p>
                <p className="truncate text-xs capitalize text-muted-foreground">
                  {member.isAgent ? "Agent" : member.role}
                </p>
              </div>
              {member.isCurrentUser ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground">
                  You
                </span>
              ) : null}
            </div>
          ))
        ) : (
          <div className="grid min-h-40 place-items-center text-sm text-muted-foreground">
            No matching members.
          </div>
        )}
      </div>
    </aside>
  );
}
