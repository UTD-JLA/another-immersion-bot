import {IUserConfig} from '../../models/userConfig';

export interface IUserConfigService {
  updateUserConfig(
    userId: string,
    config: Partial<Omit<IUserConfig, 'userId'>>
  ): Promise<void>;
  getUserConfig(userId: string): Promise<Omit<IUserConfig, 'id'>>;
  getTimezone(userId: string): Promise<string | undefined>;
  setTimezone(userId: string, timezone: string): Promise<void>;
  getReadingSpeed(userId: string): Promise<number | undefined>;
  setReadingSpeed(userId: string, readingSpeed: number): Promise<void>;
  getPageReadingSpeed(userId: string): Promise<number | undefined>;
  setPageReadingSpeed(userId: string, readingSpeed: number): Promise<void>;
  getBookPageReadingSpeed(userId: string): Promise<number | undefined>;
  setBookPageReadingSpeed(userId: string, readingSpeed: number): Promise<void>;
  getDailyGoal(userId: string): Promise<number | undefined>;
  setDailyGoal(userId: string, dailyGoal: number): Promise<void>;
}
