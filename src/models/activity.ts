export enum ActivityType {
  Listening = 'listening',
  Reading = 'reading',
}

export enum ActivityUnit {
  Page = 'page',
  Character = 'character',
  Episode = 'episode',
  BookPage = 'bookPage',
}

export interface IActivity {
  id: string;
  userId: string;
  name: string;
  type: ActivityType;
  url?: string;
  date: Date;
  duration: number;
  tags?: string[];
  rawDuration?: number;
  rawDurationUnit?: ActivityUnit;
  speed?: number;
}
