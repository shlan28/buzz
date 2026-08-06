import type { Channel } from "@/shared/api/types";
import { normalizePubkey } from "@/shared/lib/pubkey";

export type AgentDmHistoryRange = {
  since: number;
  until: number;
};

export function getAgentDmParticipant(
  channel: Channel | null,
  currentPubkey: string | undefined,
  knownAgentPubkeys: ReadonlySet<string>,
): string | null {
  if (channel?.channelType !== "dm" || !currentPubkey) return null;
  const self = normalizePubkey(currentPubkey);
  const others = channel.participantPubkeys.filter(
    (pubkey) => normalizePubkey(pubkey) !== self,
  );
  if (others.length !== 1) return null;
  const participant = normalizePubkey(others[0]);
  return knownAgentPubkeys.has(participant) ? participant : null;
}

export function toLocalDateTimeInput(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function defaultAgentDmHistoryInputs(now = new Date()) {
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  return {
    start: toLocalDateTimeInput(start),
    end: toLocalDateTimeInput(now),
  };
}

export function parseAgentDmHistoryRange(
  startInput: string,
  endInput: string,
  now = new Date(),
): { range: AgentDmHistoryRange | null; error: string | null } {
  if (!startInput || !endInput) {
    return { range: null, error: "请选择开始时间和截止时间。" };
  }
  const start = new Date(startInput);
  const end = new Date(endInput);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { range: null, error: "时间格式无效，请重新选择。" };
  }
  end.setSeconds(59, 999);
  if (start.getTime() > end.getTime()) {
    return { range: null, error: "开始时间不能晚于截止时间。" };
  }
  if (end.getTime() > now.getTime() + 59_999) {
    return { range: null, error: "截止时间不能晚于当前时间。" };
  }
  return {
    range: {
      since: Math.floor(start.getTime() / 1_000),
      until: Math.floor(end.getTime() / 1_000),
    },
    error: null,
  };
}

export function normalizeHistoryKeyword(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
