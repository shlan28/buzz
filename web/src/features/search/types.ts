import type { Channel, Message } from "@/features/channels/types";
import type { UserProfile } from "@/features/profile/types";

export type WebSearchResult =
  | { kind: "channel"; channel: Channel }
  | { kind: "person"; profile: UserProfile }
  | { kind: "message"; message: Message };

export type WebSearchState =
  | { status: "idle"; results: WebSearchResult[] }
  | { status: "loading"; results: WebSearchResult[] }
  | { status: "ready"; results: WebSearchResult[] }
  | { status: "error"; results: WebSearchResult[]; message: string };
