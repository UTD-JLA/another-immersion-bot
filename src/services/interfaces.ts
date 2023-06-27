import {Stream} from 'stream';
import {Stringifiable} from '../util/types';
import {Locale} from 'discord.js';
import {IGuildConfig} from '../models/guildConfig';
import {IUserConfig} from '../models/userConfig';

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

export interface IChartService {
  getChartPng(
    title: string,
    xlabel: string,
    ylabel: string,
    xdata: number[],
    ydata: number[],
    grid: boolean,
    color: string
  ): Promise<Stream>;

  getDateBarChartPng(
    data: {
      x: string;
      y: number;
    }[],
    color: string,
    buckets: number
  ): Promise<Stream>;
}

export interface IMaterialSourceService {
  checkForUpdates(): Promise<void>;
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
}

export interface ILocalizationService {
  localize(key: string, ...args: Stringifiable[]): string | undefined;
  mustLocalize(
    key: string,
    defaultValue: string,
    ...args: Stringifiable[]
  ): string;
  getAllLocalizations(subkey: string): Record<Locale, string>;
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
  getUserConfig(userId: string): Promise<IUserConfig>;
  getTimezone(userId: string): Promise<string | undefined>;
  setTimezone(userId: string, timezone: string): Promise<void>;
  getReadingSpeed(userId: string): Promise<number | undefined>;
  setReadingSpeed(userId: string, readingSpeed: number): Promise<void>;
  getDailyGoal(userId: string): Promise<number | undefined>;
  setDailyGoal(userId: string, dailyGoal: number): Promise<void>;
}
