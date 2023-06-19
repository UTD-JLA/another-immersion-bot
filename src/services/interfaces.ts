import {Stream} from 'stream';
import {Stringifiable} from '../util/types';
import {Locale} from 'discord.js';
import {IGuildConfig} from '../models/guildConfig';

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
}

export interface IMaterialSourceService {
  checkForUpdates(): Promise<void>;
}

export interface ILoggerService {
  log(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
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
