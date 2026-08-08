export type Channel = {
  id: string;
  name: string;
  about: string;
  updatedAt: number;
};
export type Message = {
  id: string;
  channelId: string;
  author: string;
  content: string;
  createdAt: number;
};
