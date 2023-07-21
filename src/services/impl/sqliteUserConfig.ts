import {IUserConfigService} from '../interfaces';
import {IUserConfig} from '../../models/userConfig';
import {injectable} from 'inversify';
import {eq} from 'drizzle-orm';
import {userConfigs} from '../../db/drizzle/schema/userConfigs';
import {getDb} from '../../db/drizzle';

@injectable()
export default class SqliteUserConfig implements IUserConfigService {
  public updateUserConfig(
    userId: string,
    config: Partial<Omit<IUserConfig, 'userId'>>
  ): Promise<void> {
    getDb()
      .insert(userConfigs)
      .values({
        userId,
        timeZone: config.timezone,
        readingSpeed: config.readingSpeed,
        readingSpeedPages: config.readingSpeedPages,
        dailyGoal: config.dailyGoal,
      })
      .onConflictDoUpdate({
        target: userConfigs.userId,
        set: {
          timeZone: config.timezone,
          readingSpeed: config.readingSpeed,
          readingSpeedPages: config.readingSpeedPages,
          dailyGoal: config.dailyGoal,
        },
      })
      .run();

    return Promise.resolve();
  }

  public getUserConfig(userId: string): Promise<Omit<IUserConfig, 'id'>> {
    const userConfig = getDb()
      .select()
      .from(userConfigs)
      .where(eq(userConfigs.userId, userId))
      .get();

    return Promise.resolve({
      userId: userConfig?.userId,
      timezone: userConfig?.timeZone ?? undefined,
      readingSpeed: userConfig?.readingSpeed ?? undefined,
      readingSpeedPages: userConfig?.readingSpeedPages ?? undefined,
      dailyGoal: userConfig?.dailyGoal ?? undefined,
    });
  }

  public async getTimezone(userId: string): Promise<string | undefined> {
    const userConfig = getDb()
      .select({
        timeZone: userConfigs.timeZone,
      })
      .from(userConfigs)
      .where(eq(userConfigs.userId, userId))
      .get();

    return userConfig?.timeZone ?? undefined;
  }

  public async setTimezone(userId: string, timezone: string): Promise<void> {
    getDb()
      .insert(userConfigs)
      .values({
        userId,
        timeZone: timezone,
      })
      .onConflictDoUpdate({
        target: userConfigs.userId,
        set: {
          timeZone: timezone,
        },
      })
      .run();

    return Promise.resolve();
  }

  public async getReadingSpeed(userId: string): Promise<number | undefined> {
    const userConfig = getDb()
      .select({
        readingSpeed: userConfigs.readingSpeed,
      })
      .from(userConfigs)
      .where(eq(userConfigs.userId, userId))
      .get();

    return userConfig?.readingSpeed ?? undefined;
  }

  public async setReadingSpeed(
    userId: string,
    readingSpeed: number
  ): Promise<void> {
    getDb()
      .insert(userConfigs)
      .values({
        userId,
        readingSpeed,
      })
      .onConflictDoUpdate({
        target: userConfigs.userId,
        set: {
          readingSpeed,
        },
      })
      .run();

    return Promise.resolve();
  }

  public async getPageReadingSpeed(
    userId: string
  ): Promise<number | undefined> {
    const userConfig = getDb()
      .select({
        readingSpeedPages: userConfigs.readingSpeedPages,
      })
      .from(userConfigs)
      .where(eq(userConfigs.userId, userId))
      .get();

    return userConfig?.readingSpeedPages ?? undefined;
  }

  public async setPageReadingSpeed(
    userId: string,
    readingSpeedPages: number
  ): Promise<void> {
    getDb()
      .insert(userConfigs)
      .values({
        userId,
        readingSpeedPages,
      })
      .onConflictDoUpdate({
        target: userConfigs.userId,
        set: {
          readingSpeedPages,
        },
      })
      .run();

    return Promise.resolve();
  }

  public async getDailyGoal(userId: string): Promise<number | undefined> {
    const userConfig = getDb()
      .select({
        dailyGoal: userConfigs.dailyGoal,
      })
      .from(userConfigs)
      .where(eq(userConfigs.userId, userId))
      .get();

    return userConfig?.dailyGoal ?? undefined;
  }

  public async setDailyGoal(userId: string, dailyGoal: number): Promise<void> {
    getDb()
      .insert(userConfigs)
      .values({
        userId,
        dailyGoal,
      })
      .onConflictDoUpdate({
        target: userConfigs.userId,
        set: {
          dailyGoal,
        },
      })
      .run();

    return Promise.resolve();
  }
}
