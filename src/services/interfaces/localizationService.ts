import {Stringifiable} from '../../util/types';
import {Locale} from 'discord.js';

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
