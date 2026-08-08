export type Channel = {
  id: string;
  name: string;
  about: string;
  channelType: "stream" | "forum" | "dm";
  visibility: "open" | "private";
  participantPubkeys: string[];
  updatedAt: number;
};
export type Message = {
  id: string;
  channelId: string;
  author: string;
  content: string;
  createdAt: number;
};
