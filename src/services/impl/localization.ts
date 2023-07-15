import {ILocalizationService, ILoggerService} from '../interfaces';
import {IConfig} from '../../config';
import {inject, injectable} from 'inversify';
import * as fs from 'fs';
import {Stringifiable} from '../../util/types';
import {Locale} from 'discord.js';

type LocaleData = {[key: string]: string | LocaleData};
type FlatLocaleStore = Map<string, string>;

@injectable()
export default class LocalizationService implements ILocalizationService {
  private readonly _localeStore: FlatLocaleStore = new Map();
  private readonly _locales: Set<Locale> = new Set();

  constructor(
    @inject('Config') private readonly _config: IConfig,
    @inject('LoggerService') private readonly _logger: ILoggerService
  ) {
    const folder: string = this._config.localesPath;
    const locales: LocaleData = {};

    for (const file of fs.readdirSync(folder)) {
      const locale = file.split('.')[0];
      if (Object.values(Locale).indexOf(locale as Locale) === -1) {
        this._logger.warn(`Invalid locale file: ${file}`);
        continue;
      }
      const localeFile = fs.readFileSync(`${folder}/${file}`, 'utf8');
      const localeData = JSON.parse(localeFile);
      locales[locale] = localeData;
      this._locales.add(locale as Locale);
      this._logger.log(`Loaded locale file: ${file}`);
    }

    this._localeStore = LocalizationService._flattenedLocaleData(locales);
    this._printLocaleStore();
  }

  private _printLocaleStore() {
    for (const [k, v] of this._localeStore.entries()) {
      this._logger.debug(`Loaded locale string: ${k} => ${v}`);
    }
  }

  public getAllLocalizations(subkey: string): Record<Locale, string> {
    const result: Record<Locale, string> = {} as Record<Locale, string>;
    const locales = this._locales;

    for (const locale of locales) {
      const key = `${locale}.${subkey}`;
      const value = this._localeStore.get(key);
      if (value) {
        result[locale] = value;
      }
    }

    return result;
  }

  public localize(key: string, ...args: Stringifiable[]): string | undefined {
    const formatString = this._localeStore.get(key);

    if (!formatString) {
      return undefined;
    }

    return LocalizationService._formatString(formatString, ...args);
  }

  public mustLocalize(
    key: string,
    defaultValue: string,
    ...args: Stringifiable[]
  ): string {
    return this.localize(key, ...args) ?? defaultValue;
  }

  /**
   * Create a new ILocalizationService with the locale set
   * @param locale Set the locale to use for localization
   * @returns A new ILocalizationService with the locale set
   */
  public useScope(
    locale: Locale,
    scope?: string
  ): Omit<ILocalizationService, 'useScope' | 'getAllLocalizations'> {
    const prefix = locale + (scope ? `.${scope}` : '');

    return {
      localize: (key: string, ...args: Stringifiable[]): string | undefined => {
        return this.localize(`${prefix}.${key}`, ...args);
      },
      mustLocalize: (
        key: string,
        defaultValue: string,
        ...args: Stringifiable[]
      ): string => {
        return this.mustLocalize(`${prefix}.${key}`, defaultValue, ...args);
      },
    };
  }

  private static _formatString(
    format: string,
    ...args: Stringifiable[]
  ): string {
    let result = format;

    for (let i = 0; i < args.length; i++) {
      result = result.replace(`{${i}}`, String(args[i]));
    }

    return result;
  }

  private static _flattenedLocaleData(localeData: LocaleData): FlatLocaleStore {
    const result = new Map<string, string>();

    for (const key of Object.keys(localeData)) {
      const value = localeData[key];
      if (typeof value === 'string') {
        result.set(key, value);
      } else if (typeof value === 'object') {
        const subObject = LocalizationService._flattenedLocaleData(value);
        for (const subKey of subObject.keys()) {
          result.set(`${key}.${subKey}`, subObject.get(subKey)!);
        }
      } else {
        throw new Error(`Invalid locale data: ${value}`);
      }
    }

    return result;
  }
}
