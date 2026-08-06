export type TrackStatus = "planned" | "active" | "completed" | "canceled";

export type TrackScope = "current" | "completed" | "archived";

export type Track = {
  id: string;
  eventId: string;
  name: string;
  description: string;
  owner: string;
  members: string[];
  startDate: string;
  endDate: string;
  status: TrackStatus;
  archived: boolean;
  creator: string;
  lastEditor: string;
  createdAt: number;
  updatedAt: number;
  canRead: boolean;
  canManage: boolean;
};

export type TrackDraft = Pick<
  Track,
  | "id"
  | "name"
  | "description"
  | "owner"
  | "members"
  | "startDate"
  | "endDate"
  | "status"
>;

export type TrackPatch = Partial<Omit<TrackDraft, "id">> & {
  archived?: boolean;
};

export type TrackOwnerOption = {
  pubkey: string;
  label: string;
  kind: "person" | "agent";
};

export type TrackProgress = {
  completed: number;
  total: number;
  percent: number;
};
