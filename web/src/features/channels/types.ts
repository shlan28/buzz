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
export type Message = {
  id: string;
  channelId: string;
  author: string;
  content: string;
  createdAt: number;
};
