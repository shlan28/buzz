export type Track = {
  id: string;
  name: string;
  description: string;
  owner?: string;
  members: string[];
  startDate?: string;
  endDate?: string;
  status: string;
  archived: boolean;
  updatedAt: number;
};
