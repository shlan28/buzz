export type TrackStatus =
  | "planned"
  | "active"
  | "paused"
  | "completed"
  | "canceled";

export type Track = {
  id: string;
  name: string;
  description: string;
  owner?: string;
  members: string[];
  startDate?: string;
  endDate?: string;
  status: TrackStatus;
  archived: boolean;
  updatedAt: number;
};
