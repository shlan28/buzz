export type Channel = {
  id: string;
  name: string;
  about: string;
  channelType: "stream" | "forum" | "dm";
  visibility: "open" | "private";
  participantPubkeys: string[];
  isMember: boolean;
  archivedAt: number | null;
  displayName: string;
  updatedAt: number;
};
export type ChannelMemberRole = "owner" | "admin" | "member" | "guest" | "bot";
export type ChannelMember = {
  pubkey: string;
  role: ChannelMemberRole;
};
export type Message = {
  id: string;
  kind: number;
  tags: string[][];
  channelId: string;
  author: string;
  content: string;
  createdAt: number;
};
