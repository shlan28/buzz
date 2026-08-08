import { parseCalendarItem } from "@/features/calendar/eventCodec";
import type { CalendarItem } from "@/features/calendar/types";
import { parseChannel, parseMessage } from "@/features/channels/eventCodec";
import type { Channel, Message } from "@/features/channels/types";
import { parseTask } from "@/features/tasks/eventCodec";
import type { Task } from "@/features/tasks/types";
import { parseTrack } from "@/features/tracks/eventCodec";
import type { Track } from "@/features/tracks/types";
import { KINDS, MESSAGE_KINDS } from "@/shared/domain/eventKinds";
import { latestByCoordinate } from "@/shared/domain/eventTags";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { queryRelay } from "./relaySession";
import { openPairedSigner } from "./signer";

export type WorkConsoleData = {
  userPubkey: string;
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
    const events = await queryRelay(relayWsUrl(), signer, [
      { kinds: [KINDS.channelMetadata], limit: 300 },
      { kinds: MESSAGE_KINDS, limit: 500 },
      { kinds: [KINDS.calendarDate, KINDS.calendarTime], limit: 500 },
      { kinds: [KINDS.taskState], limit: 500 },
      { kinds: [KINDS.trackState], limit: 300 },
    ]);
    return {
      userPubkey: signer.userPubkey,
      channels: latestByCoordinate(
        events.map(parseChannel).filter(isPresent),
      ).filter((item) => item.name.length > 0),
      messages: events.map(parseMessage).filter(isPresent),
      calendar: latestByCoordinate(
        events.map(parseCalendarItem).filter(isPresent),
      ).filter((item) => item.start.getFullYear() > 2000),
      tasks: latestByCoordinate(events.map(parseTask).filter(isPresent)).filter(
        (item) => !item.archived,
      ),
      tracks: latestByCoordinate(
        events.map(parseTrack).filter(isPresent),
      ).filter((item) => !item.archived),
    };
  } finally {
    signer.close();
  }
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
