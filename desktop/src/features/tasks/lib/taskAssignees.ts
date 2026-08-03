import type {
  ManagedAgent,
  RelayAgent,
  RelayMember,
  UserProfileSummary,
} from "@/shared/api/types";
import { truncatePubkey } from "@/shared/lib/pubkey";
import type { TaskAssignee } from "../types";
import { resolveTaskAssignmentAccess } from "./taskAssignmentAccess";

type AgentIdentity = Pick<
  ManagedAgent,
  "pubkey" | "name" | "taskAssignmentPolicy" | "taskAssignmentAllowlist"
>;

type RelayAgentIdentity = Pick<
  RelayAgent,
  "pubkey" | "name" | "taskAssignmentPolicy" | "taskAssignmentAllowlist"
>;

export function buildTaskAssignees(input: {
  members: readonly Pick<RelayMember, "pubkey">[];
  profiles: Readonly<Record<string, UserProfileSummary>>;
  managedAgents: readonly AgentIdentity[];
  relayAgents: readonly RelayAgentIdentity[];
  viewerPubkey?: string;
}): TaskAssignee[] {
  const managedByPubkey = new Map(
    input.managedAgents.map((agent) => [agent.pubkey.toLowerCase(), agent]),
  );
  const relayByPubkey = new Map(
    input.relayAgents.map((agent) => [agent.pubkey.toLowerCase(), agent]),
  );
  const result: TaskAssignee[] = [
    { pubkey: null, label: "Unassigned", kind: "unassigned" },
  ];
  const seen = new Set<string>();

  for (const member of input.members) {
    const pubkey = member.pubkey.toLowerCase();
    if (seen.has(pubkey)) continue;
    seen.add(pubkey);

    const managed = managedByPubkey.get(pubkey);
    const relay = relayByPubkey.get(pubkey);
    const profile = input.profiles[pubkey];
    const isViewer = pubkey === input.viewerPubkey?.toLowerCase();
    const isAgent = !isViewer && Boolean(managed ?? relay);
    const access = isAgent
      ? resolveTaskAssignmentAccess({
          viewerPubkey: input.viewerPubkey,
          ownerPubkey: profile?.ownerPubkey,
          policy:
            managed?.taskAssignmentPolicy ??
            relay?.taskAssignmentPolicy ??
            null,
          allowlist:
            managed?.taskAssignmentAllowlist ??
            relay?.taskAssignmentAllowlist ??
            [],
          locallyManaged: Boolean(managed),
        })
      : { allowed: true };

    result.push({
      pubkey: member.pubkey,
      label:
        profile?.displayName ??
        managed?.name ??
        relay?.name ??
        truncatePubkey(member.pubkey),
      kind: isAgent ? "agent" : "person",
      canAssign: access.allowed,
      unavailableReason: access.reason,
    });
  }

  return result;
}
