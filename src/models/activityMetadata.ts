export type JlptLevelMap = {
  1: number; // N1
  2: number; // N2
  3: number; // N3
  4: number; // N4
  5: number; // N5
};

export type JoyoLevelMap = {
  1: number; // Grade 1
  2: number; // Grade 2
  3: number; // Grade 3
  4: number; // Grade 4
  5: number; // Grade 5
  6: number; // Grade 6
  7: number; // Grade 7
  8: number; // Grade 8
  9: number; // Grade 9
  10: number; // Grade 10
  11: number; // Grade 11
  12: number; // Grade 12
};

export type TokenStats = {
  joyoLevels: JoyoLevelMap;
  jlptLevels: JlptLevelMap;
  unique: number;
  // group frequencies into buckets of 500
  // e.g. 0-500, 501-1000, 1001-1500, etc.
  frequencyBuckets: number[];
};

export interface IActivityMetadata {
  activityId: string;
  contentLength?: number;
  kanji?: TokenStats;
  words?: TokenStats;
}
