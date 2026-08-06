import { useQuery } from "@tanstack/react-query";

import { getChannelHistoryRangeEvents } from "@/shared/api/channelWindow";
import { searchMessages } from "@/shared/api/tauri";
import type { RelayEvent } from "@/shared/api/types";

export type AgentDmHistoryRequest = {
  channelId: string;
  since: number;
  until: number;
  keyword: string;
};

export type AgentDmHistoryResult = {
  events: RelayEvent[];
  found: number;
  limited: boolean;
};

const HISTORY_LIMIT = 500;
const SEARCH_LIMIT = 100;

export function useAgentDmHistoryQuery(request: AgentDmHistoryRequest | null) {
  return useQuery({
    enabled: request !== null,
    queryKey: request
      ? [
          "agent-dm-history",
          request.channelId,
          request.since,
          request.until,
          request.keyword,
        ]
      : ["agent-dm-history", "idle"],
    queryFn: async (): Promise<AgentDmHistoryResult> => {
      if (!request) return { events: [], found: 0, limited: false };
      if (request.keyword) {
        const response = await searchMessages({
          q: request.keyword,
          channelId: request.channelId,
          since: request.since,
          until: request.until,
          limit: SEARCH_LIMIT,
        });
        return {
          events: response.hits.map((hit) => ({
            id: hit.eventId,
            pubkey: hit.pubkey,
            created_at: hit.createdAt,
            kind: hit.kind,
            tags: hit.channelId ? [["h", hit.channelId]] : [],
            content: hit.content,
            sig: "",
          })),
          found: response.found,
          limited: response.found > response.hits.length,
        };
      }
      const events = await getChannelHistoryRangeEvents(
        request.channelId,
        request.since,
        request.until,
        HISTORY_LIMIT,
      );
      return {
        events: [...events].sort(
          (left, right) => left.created_at - right.created_at,
        ),
        found: events.length,
        limited: events.length >= HISTORY_LIMIT,
      };
    },
    staleTime: 30_000,
    gcTime: 5 * 60 * 1_000,
  });
}
