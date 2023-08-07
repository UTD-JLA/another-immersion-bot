import {Stringifiable} from '../util/types';
import {Locale} from 'discord.js';
import {IGuildConfig} from '../models/guildConfig';
import {IUserConfig} from '../models/userConfig';
import {IActivity, ActivityType, ActivityUnit} from '../models/activity';
import {MaterialLanguage} from '../models/material';

export interface ISuggestion {
  name: string;
  value: string;
}

export interface IAutocompletionService {
  getSuggestions(
    input: string,
    limit: number,
    scope?: string
  ): Promise<ISuggestion[]>;

  resolveSuggestion(suggestionValue: string): Promise<string>;
}

export type MaterialResult = {id: string; text: string};

export interface IMaterialSourceService {
  validateId(id: string): boolean;
  checkForUpdates(): Promise<void>;
  search(
    text: string,
    limit: number,
    scope?: string,
    locale?: MaterialLanguage
  ): Promise<MaterialResult[]>;
  getMaterial(id: string): Promise<MaterialResult>;
}

export interface ILoggerService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log(message: string, meta?: any): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error(message: string, meta?: any): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn(message: string, meta?: any): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  child(meta: any): ILoggerService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug(message: string, meta?: any): void;
}

export type LocalizationScope = ReturnType<ILocalizationService['useScope']>;

export interface ILocalizationService {
  localize(key: string, ...args: Stringifiable[]): string | undefined;
  mustLocalize(
    key: string,
    defaultValue: string,
    ...args: Stringifiable[]
  ): string;
  getAllLocalizations(subkey: string): Record<Locale, string>;
  useScope(
    locale: Locale,
    scope?: string
  ): Omit<ILocalizationService, 'useScope' | 'getAllLocalizations'>;
}

export interface IGuildConfigService {
  getGuildConfig(guildId: string): Promise<IGuildConfig>;
  updateGuildConfig(
    guildId: string,
    config: Partial<IGuildConfig>
  ): Promise<void>;
}

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

export interface IActivityService {
  createActivity(activity: Omit<IActivity, 'id'>): Promise<IActivity>;
  deleteActivityById(activityId: string): Promise<void>;
  getActivityById(activityId: string): Promise<IActivity | null>;
  getActivities(userId: string, limit?: number): Promise<IActivity[]>;
  getTopMembers(
    memberIds: string[],
    limit: number,
    since?: Date,
    type?: ActivityType
  ): Promise<{discordId: string; duration: number}[]>;
  getActivitiesInDateRange(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<IActivity[]>;
  getSpeedsInDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
    type?: ActivityUnit
  ): Promise<Array<[Date, number]>>;
  getDailyDurationsInDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
    timezone?: string
  ): Promise<Array<[`${number}-${number}-${number}`, number]>>;
  on(event: 'activityCreated', listener: (activity: IActivity) => void): void;
}

export interface IUserSpeedService {
  predictSpeed(userId: string, type: ActivityUnit): Promise<number>;
  convertUnit(
    userId: string,
    from: ActivityUnit,
    to: ActivityUnit,
    value: number
  ): Promise<number>;
}
