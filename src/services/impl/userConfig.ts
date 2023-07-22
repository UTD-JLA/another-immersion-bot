import {IUserConfigService} from '../interfaces';
import {IUserConfig} from '../../models/userConfig';
import {UserConfig} from '../../db/mongoose';
import {injectable} from 'inversify';

@injectable()
export default class UserConfigService implements IUserConfigService {
  private readonly _cache: Map<string, Omit<IUserConfig, 'id' | 'userId'>> =
    new Map();

  // Either returns the cached config or fetches it from the database
  private async _getUserConfig(
    userId: string
  ): Promise<Omit<IUserConfig, 'id'>> {
    const isCached = this._cache.has(userId);
    if (!isCached) {
      const config = await UserConfig.findOne({userId});
      if (!config) {
        this._cache.set(userId, {});
      } else {
        this._cache.set(userId, config.toObject());
      }
    }
    return {...this._cache.get(userId), userId};
  }

  // Updates or creates a new config in the database and updates the cache
  private async _updateUserConfig(
    userId: string,
    config: Partial<Omit<IUserConfig, 'id' | 'userId'>>
  ): Promise<void> {
    const newConfig = await UserConfig.findOneAndUpdate(
      {userId},
      {$set: config},
      {upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true}
    );

    this._cache.set(userId, newConfig.toObject());
  }

  updateUserConfig(
    userId: string,
    config: Partial<Omit<IUserConfig, 'userId'>>
  ): Promise<void> {
    return this._updateUserConfig(userId, config);
  }

  getUserConfig(userId: string): Promise<Omit<IUserConfig, 'id'>> {
    return this._getUserConfig(userId);
  }

  async getTimezone(userId: string): Promise<string | undefined> {
    const config = await this._getUserConfig(userId);
    return config.timezone;
  }

  async setTimezone(userId: string, timezone: string): Promise<void> {
    await this._updateUserConfig(userId, {timezone});
  }

  async getReadingSpeed(userId: string): Promise<number | undefined> {
    const config = await this._getUserConfig(userId);
    return config.readingSpeed;
  }

  async setReadingSpeed(userId: string, readingSpeed: number): Promise<void> {
    await this._updateUserConfig(userId, {readingSpeed});
  }

  async getPageReadingSpeed(userId: string): Promise<number | undefined> {
    const config = await this._getUserConfig(userId);
    return config.readingSpeedPages;
  }

  async setPageReadingSpeed(
    userId: string,
    readingSpeedPages: number
  ): Promise<void> {
    await this._updateUserConfig(userId, {readingSpeedPages});
  }

  async getDailyGoal(userId: string): Promise<number | undefined> {
    const config = await this._getUserConfig(userId);
    return config.dailyGoal;
  }

  async setDailyGoal(userId: string, dailyGoal: number): Promise<void> {
    await this._updateUserConfig(userId, {dailyGoal});
  }
}
