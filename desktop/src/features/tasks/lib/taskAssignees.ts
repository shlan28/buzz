import type {
  ManagedAgent,
  RelayAgent,
  RelayMember,
  UserProfileSummary,
} from "@/shared/api/types";
import { normalizePubkey, truncatePubkey } from "@/shared/lib/pubkey";
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
  namesLoading?: boolean;
}): TaskAssignee[] {
  const managedByPubkey = new Map(
    input.managedAgents.map((agent) => [normalizePubkey(agent.pubkey), agent]),
  );
  const relayByPubkey = new Map(
    input.relayAgents.map((agent) => [normalizePubkey(agent.pubkey), agent]),
  );
  const viewerPubkey = input.viewerPubkey
    ? normalizePubkey(input.viewerPubkey)
    : undefined;
  const managedIdentityKeys = new Set(
    viewerPubkey
      ? input.managedAgents.map(
          (agent) => `${viewerPubkey}:${normalizeIdentityName(agent.name)}`,
        )
      : [],
  );
  const result: TaskAssignee[] = [
    {
      pubkey: null,
      label: "Unassigned",
      selectorLabel: "Unassigned",
      shortId: null,
      kind: "unassigned",
      isCurrent: false,
      isNameLoading: false,
    },
  ];
  const seen = new Set<string>();

  for (const member of input.members) {
    const pubkey = normalizePubkey(member.pubkey);
    if (!pubkey || seen.has(pubkey)) continue;
    seen.add(pubkey);

    const managed = managedByPubkey.get(pubkey);
    const relay = relayByPubkey.get(pubkey);
    const profile = input.profiles[pubkey];
    const isViewer = pubkey === viewerPubkey;
    if (!isViewer && !profile && !managed && !relay && !input.namesLoading) {
      continue;
    }

    const resolvedName = firstName(
      profile?.displayName,
      managed?.name,
      relay?.name,
    );
    const label = resolvedName ?? truncatePubkey(member.pubkey);
    const profileOwner = profile?.ownerPubkey
      ? normalizePubkey(profile.ownerPubkey)
      : undefined;
    const replacedByManaged =
      !managed &&
      profileOwner !== undefined &&
      resolvedName !== undefined &&
      managedIdentityKeys.has(
        `${profileOwner}:${normalizeIdentityName(resolvedName)}`,
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
      selectorLabel: isViewer ? "You" : (resolvedName ?? "Unnamed member"),
      shortId: truncatePubkey(member.pubkey),
      kind: isAgent ? "agent" : "person",
      isCurrent: isViewer,
      isNameLoading:
        !isViewer && resolvedName === undefined && Boolean(input.namesLoading),
      canAssign: access.allowed,
      unavailableReason: access.reason,
    });
  }

  return result;
}

function firstName(...names: Array<string | null | undefined>) {
  for (const name of names) {
    const normalized = name?.trim();
    if (normalized) return normalized;
  }
  return undefined;
}

function normalizeIdentityName(name: string) {
  return name.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}
