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
  const viewerPubkey = input.viewerPubkey?.toLowerCase();
  const managedIdentityKeys = new Set(
    viewerPubkey
      ? input.managedAgents.map(
          (agent) => `${viewerPubkey}:${normalizeIdentityName(agent.name)}`,
        )
      : [],
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
    const isViewer = pubkey === viewerPubkey;
    if (!isViewer && !profile && !managed && !relay) continue;

    const label =
      profile?.displayName ??
      managed?.name ??
      relay?.name ??
      truncatePubkey(member.pubkey);
    const profileOwner = profile?.ownerPubkey?.toLowerCase();
    const replacedByManaged =
      !managed &&
      profileOwner !== undefined &&
      managedIdentityKeys.has(
        `${profileOwner}:${normalizeIdentityName(label)}`,
      );
    if (replacedByManaged) continue;

    const isAgent =
      !isViewer && Boolean(managed ?? relay ?? profile?.ownerPubkey);
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
      label,
      kind: isAgent ? "agent" : "person",
      canAssign: access.allowed,
      unavailableReason: access.reason,
    });
  }

  return result;
}

function normalizeIdentityName(name: string) {
  return name.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}
