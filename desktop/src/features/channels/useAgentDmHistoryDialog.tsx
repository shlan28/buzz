import * as React from "react";

import { getAgentDmParticipant } from "@/features/channels/lib/agentDmHistory";
import { AgentDmHistoryDialog } from "@/features/channels/ui/AgentDmHistoryDialog";
import type { Channel, Profile } from "@/shared/api/types";

export function useAgentDmHistoryDialog({
  activeChannel,
  agentAvatarUrl,
  agentName,
  agentPubkeys,
  currentProfile,
  currentPubkey,
}: {
  activeChannel: Channel | null;
  agentAvatarUrl: string | null;
  agentName: string;
  agentPubkeys: ReadonlySet<string>;
  currentProfile?: Profile;
  currentPubkey?: string;
}) {
  const [openChannelId, setOpenChannelId] = React.useState<string | null>(null);
  const agentPubkey = getAgentDmParticipant(
    activeChannel,
    currentPubkey,
    agentPubkeys,
  );
  const channelId = activeChannel?.id ?? null;
  const available = Boolean(channelId && agentPubkey && currentPubkey);

  return {
    dialog:
      activeChannel && agentPubkey && currentPubkey ? (
        <AgentDmHistoryDialog
          agentAvatarUrl={agentAvatarUrl}
          agentName={agentName}
          agentPubkey={agentPubkey}
          channelId={activeChannel.id}
          currentAvatarUrl={currentProfile?.avatarUrl ?? null}
          currentDisplayName={currentProfile?.displayName?.trim() || "你"}
          currentPubkey={currentPubkey}
          key={activeChannel.id}
          onOpenChange={(open) =>
            setOpenChannelId(open ? activeChannel.id : null)
          }
          open={openChannelId === activeChannel.id}
        />
      ) : null,
    open: available ? () => setOpenChannelId(channelId) : undefined,
  };
}
