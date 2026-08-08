import { parseCalendarItem } from "@/features/calendar/eventCodec";
import type { CalendarItem } from "@/features/calendar/types";
import { parseChannel, parseMessage } from "@/features/channels/eventCodec";
import type { Channel, Message } from "@/features/channels/types";
import { channelDisplayName } from "@/features/channels/channelLabels";
import { buildProfileLookup } from "@/features/profile/eventCodec";
import type { ProfileLookup, UserProfile } from "@/features/profile/types";
import { parseTask } from "@/features/tasks/eventCodec";
import type { Task } from "@/features/tasks/types";
import { parseTrack } from "@/features/tracks/eventCodec";
import type { Track } from "@/features/tracks/types";
import { KINDS, MESSAGE_KINDS } from "@/shared/domain/eventKinds";
import { latestByCoordinate } from "@/shared/domain/eventTags";
import { relayHttpBaseUrl } from "@/shared/lib/relay-url";
import { queryRelayHttp } from "./relayHttp";
import { openPairedSigner } from "./signer";
import type { NostrFilter } from "@/shared/lib/nostr-client";

export type WorkConsoleData = {
  userPubkey: string;
  currentProfile?: UserProfile;
  profilesByPubkey: ProfileLookup;
  membersByChannelId: Record<string, string[]>;
  channels: Channel[];
  messages: Message[];
  calendar: CalendarItem[];
  tasks: Task[];
  tracks: Track[];
};

export async function loadWorkConsoleData(): Promise<WorkConsoleData> {
  if (import.meta.env.MODE === "e2e" && window.__BUZZ_E2E_WORK_CONSOLE_DATA__) {
    return window.__BUZZ_E2E_WORK_CONSOLE_DATA__;
  }
  const signer = await openPairedSigner();
  try {
    const baseUrl = relayHttpBaseUrl();
    const events = await queryRelayHttp(
      baseUrl,
      signer,
      workConsoleCoreFilters(signer.userPubkey),
    );
    const calendarEvents = await queryRelayHttp(
      baseUrl,
      signer,
      workConsoleCalendarFilters(),
    ).catch((error: unknown) => {
      console.warn("Calendar query failed without blocking other data", error);
      return [];
    });
    const allChannels = latestByCoordinate(
      events.map(parseChannel).filter(isPresent),
    );
    const membershipEvents = events.filter(
      (event) => event.kind === KINDS.channelMembership,
    );
    const membersByChannelId: Record<string, string[]> = {};
    for (const event of membershipEvents) {
      const channelId = event.tags.find((tag) => tag[0] === "d")?.[1];
      if (!channelId) continue;
      membersByChannelId[channelId] = [
        ...new Set(
          event.tags
            .filter((tag) => tag[0] === "p" && tag[1])
            .map((tag) => tag[1].toLowerCase()),
        ),
      ];
    }
    const memberChannelIds = new Set(Object.keys(membersByChannelId));
    const visibility = events
      .filter((event) => event.kind === KINDS.dmVisibility)
      .sort((left, right) => right.created_at - left.created_at)[0];
    const hiddenDmIds = new Set(
      visibility?.tags
        .filter((tag) => tag[0] === "h" && tag[1])
        .map((tag) => tag[1]) ?? [],
    );
    const channels = allChannels
      .filter(
        (channel) =>
          memberChannelIds.has(channel.id) &&
          channel.archivedAt === null &&
          (channel.channelType !== "dm" || !hiddenDmIds.has(channel.id)),
      )
      .map((channel) => ({ ...channel, isMember: true }));
    const messages = events.map(parseMessage).filter(isPresent);
    const tasks = latestByCoordinate(
      events.map(parseTask).filter(isPresent),
    ).filter((item) => !item.archived);
    const profilePubkeys = new Set<string>([
      signer.userPubkey.toLowerCase(),
      ...channels.flatMap((channel) => channel.participantPubkeys),
      ...messages.map((message) => message.author),
      ...tasks.flatMap((task) => task.assignee ?? []),
      ...Object.values(membersByChannelId).flat(),
    ]);
    const profileEvents = profilePubkeys.size
      ? await queryRelayHttp(baseUrl, signer, [
          {
            kinds: [KINDS.profile],
            authors: [...profilePubkeys],
            limit: profilePubkeys.size,
          },
        ])
      : [];
    const profilesByPubkey = buildProfileLookup(profileEvents);
    const visibleChannels = channels.map((channel) => ({
      ...channel,
      displayName: channelDisplayName(
        channel,
        signer.userPubkey,
        profilesByPubkey,
      ),
    }));
    return {
      userPubkey: signer.userPubkey,
      currentProfile: profilesByPubkey[signer.userPubkey.toLowerCase()],
      profilesByPubkey,
      membersByChannelId,
      channels: visibleChannels,
      messages: sortMessagesForTimeline(messages),
      calendar: latestByCoordinate(
        calendarEvents.map(parseCalendarItem).filter(isPresent),
      ).filter((item) => item.start.getFullYear() > 2000),
      tasks,
      tracks: latestByCoordinate(
        events.map(parseTrack).filter(isPresent),
      ).filter((item) => !item.archived),
    };
  } finally {
    signer.close();
  }
}

export function sortMessagesForTimeline(messages: Message[]): Message[] {
  return [
    ...new Map(messages.map((message) => [message.id, message])).values(),
  ].sort(
    (left, right) =>
      left.createdAt - right.createdAt || left.id.localeCompare(right.id),
  );
}

export function workConsoleCoreFilters(userPubkey?: string): NostrFilter[] {
  return [
    { kinds: [KINDS.channelMetadata], limit: 300 },
    ...(userPubkey
      ? [
          {
            kinds: [KINDS.channelMembership],
            "#p": [userPubkey],
            limit: 300,
          },
          {
            kinds: [KINDS.dmVisibility],
            "#p": [userPubkey],
            limit: 1,
          },
        ]
      : []),
    { kinds: MESSAGE_KINDS, limit: 500 },
    { kinds: [KINDS.taskState], limit: 500 },
    { kinds: [KINDS.trackState], limit: 300 },
  ];
}

export function workConsoleCalendarFilters(): NostrFilter[] {
  return [
    {
      kinds: [KINDS.calendarDate, KINDS.calendarTime],
      owned_authors: true,
      limit: 500,
    },
  ];
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
