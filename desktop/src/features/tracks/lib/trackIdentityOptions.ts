import type {
  ManagedAgent,
  RelayAgent,
  RelayMember,
  UserProfileSummary,
} from "@/shared/api/types";
import { normalizePubkey, truncatePubkey } from "@/shared/lib/pubkey";
import type { TrackOwnerOption } from "../types";

type AgentIdentity = Pick<ManagedAgent, "pubkey" | "name">;
type RelayAgentIdentity = Pick<RelayAgent, "pubkey" | "name">;

export function buildTrackIdentityOptions(input: {
  members: readonly Pick<RelayMember, "pubkey">[];
  profiles: Readonly<Record<string, UserProfileSummary>>;
  managedAgents: readonly AgentIdentity[];
  relayAgents: readonly RelayAgentIdentity[];
  viewerPubkey?: string;
  namesLoading: boolean;
}): TrackOwnerOption[] {
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
  const seen = new Set<string>();
  const result: TrackOwnerOption[] = [];

  for (const member of input.members) {
    const pubkey = normalizePubkey(member.pubkey);
    if (!pubkey || seen.has(pubkey)) continue;
    seen.add(pubkey);

    const managed = managedByPubkey.get(pubkey);
    const relay = relayByPubkey.get(pubkey);
    const profile = input.profiles[pubkey];
    const isCurrent = pubkey === viewerPubkey;
    if (!isCurrent && !profile && !managed && !relay && !input.namesLoading) {
      continue;
    }

    const resolvedName = firstName(
      profile?.displayName,
      managed?.name,
      relay?.name,
    );
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
      !isCurrent && Boolean(managed ?? relay ?? profile?.ownerPubkey);
    result.push({
      pubkey: member.pubkey,
      label: isCurrent ? "You" : (resolvedName ?? "Unnamed member"),
      shortId: truncatePubkey(member.pubkey),
      kind: isAgent ? "agent" : "person",
      isCurrent,
      isNameLoading:
        !isCurrent && resolvedName === undefined && input.namesLoading,
    });
  }

  return result.sort((left, right) => {
    if (left.isCurrent !== right.isCurrent) return left.isCurrent ? -1 : 1;
    return left.label.localeCompare(right.label);
  });
}

export function unavailableTrackIdentity(pubkey: string): TrackOwnerOption {
  return {
    pubkey,
    label: "Unavailable identity",
    shortId: truncatePubkey(pubkey),
    kind: "person",
    isCurrent: false,
    isNameLoading: false,
    unavailable: true,
  };
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
