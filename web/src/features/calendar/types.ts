export type CalendarItem = {
  id: string;
  title: string;
  description: string;
  start: Date;
  end?: Date;
  allDay: boolean;
  location?: string;
  author: string;
  updatedAt: number;
};
