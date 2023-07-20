export enum ActivityType {
  Listening = 'listening',
  Reading = 'reading',
}

export enum ActivitySubtype {
  Video = 'video',
  VN = 'vn',
  Anime = 'anime',
  Manga = 'manga',
  Book = 'book',
}

export enum ActivityUnit {
  Page = 'page',
  Character = 'character',
  Episode = 'episode',
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
  // Virtuals
  subtype?: ActivitySubtype;
  roundedDuration?: number;
  formattedDuration?: string;
}
