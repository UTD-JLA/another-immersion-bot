import {
  ILoggerService,
  IMaterialSourceService,
  MaterialResult,
} from '../interfaces';
import {MaterialLanguage} from '../../models/material';
import {readdir, readFile} from 'fs/promises';
import {inject, injectable} from 'inversify';
import {IConfig} from '../../config';
import {Document} from 'flexsearch';
import {isRomaji, toKatakana, toRomaji} from 'wanakana';

export type IndexEntry = {
  scope: string;
  language: MaterialLanguage;
  text: string;
  aliases: string[];
};

type IndexEntryWithId = IndexEntry & {id: number};

@injectable()
export default class FlexsearchMaterialSourceService
  implements IMaterialSourceService
{
  private readonly _materialDataPath: string;
  private readonly _logger: ILoggerService;
  private readonly _refArray: IndexEntry[] = [];
  private readonly _documentIndex: Document<IndexEntryWithId>;

  constructor(
    @inject('Config') config: IConfig,
    @inject('LoggerService') logger: ILoggerService
  ) {
    this._materialDataPath = config.materialsPath;
    this._logger = logger;
    this._documentIndex = new Document({
      document: {
        id: 'id',
        index: ['text', 'aliases'],
      },
      encode: this._encodeString.bind(this),
      tokenize: 'forward',
    });
  }

  public async search(
    query: string,
    limit: number,
    scope?: string,
    language?: MaterialLanguage
  ): Promise<{id: string; text: string}[]> {
    const encodedQuery = this._encodeString(query).join('');

    let results = this._search(query);

    if (results.length === 0 && isRomaji(query)) {
      // this will turn non-standard romaji into something more likely to be found
      // such as 'genjitu no yohane' -> 'genjitsu no youhane'
      results = this._search(toRomaji(toKatakana(query)));
    }

    results = results
      .filter(entry => {
        if (scope && entry.scope !== scope) {
          return false;
        }

        if (language && entry.language !== language) {
          return false;
        }

        return true;
      })
      .map(entry => ({
        ...entry,
        strings: [
          this._encodeString(entry.text).join(''),
          ...entry.aliases
            .map(this._encodeString.bind(this))
            .map(s => s.join('')),
        ],
      }))
      .sort((a, b) => {
        const aHasExactSubstr = a.strings.some(s => s.includes(encodedQuery));
        const bHasExactSubstr = b.strings.some(s => s.includes(encodedQuery));

        if (aHasExactSubstr && !bHasExactSubstr) {
          return -1;
        }

        if (!aHasExactSubstr && bHasExactSubstr) {
          return 1;
        }

        return 0;
      })
      .slice(0, limit);

    return results.map(result => ({
      id: result.id.toString(),
      text: result.text,
    }));
  }

  private _search(query: string): IndexEntryWithId[] {
    const foundIds = new Set<number>();

    const results = this._documentIndex
      .search(query)
      .map(fieldResult => {
        const {result} = fieldResult;
        const entries = [];

        for (const id of result) {
          const index = id as number;
          if (foundIds.has(index)) {
            continue;
          }

          foundIds.add(index);
          entries.push({
            ...this._refArray[index],
            id: index,
          });
        }

        return entries;
      })
      .flat();

    return results;
  }

  private _isProbablyJapanese(str: string): boolean {
    return /[一-龠]+|[ぁ-ゔ]+|[ァ-ヴー]+|[ａ-ｚＡ-Ｚ０-９]+|[々〆〤ヶ]+/u.test(
      str
    );
  }

  private _encodeString(str: string): string[] {
    return str
      .replace(/[!"#$%&'()*+,-./:;<=>?@[\]^_`{|}~]/g, '')
      .split(/\s+/)
      .filter(
        char => this._isProbablyJapanese(char) || char.match(/[a-zA-Z0-9]/)
      )
      .map(word =>
        this._isProbablyJapanese(word) ? word.split('') : word.toLowerCase()
      )
      .flat();
  }

  public async checkForUpdates(): Promise<void> {
    const files = await readdir(this._materialDataPath);

    this._logger.debug(`Found ${files.length} files`);

    for (const file of files) {
      const fileNameParts = file.split('.');

      this._logger.debug(`Checking ${file}`);

      if (fileNameParts.length < 2) {
        continue;
      }

      this._logger.debug(`Indexing ${file}`);

      const [language, scope] = fileNameParts;
      const filePath = `${this._materialDataPath}/${file}`;
      const fileContent = await readFile(filePath, 'utf8');
      // groups are seperated by two newlines
      const groups = fileContent.split('\n\n');

      // if this file is in groups, use aliases
      if (groups.length > 1) {
        this._logger.debug(`${file} is in groups, using aliases`);

        const entries = groups.map<IndexEntry>(group => {
          const lines = group.split('\n');
          const text = lines.shift()!;
          const aliases = lines;

          return {
            scope,
            language: language as MaterialLanguage,
            text,
            aliases,
          };
        });

        this._refArray.push(...entries.filter(entry => entry.text !== ''));
        continue;
      }

      // otherwise, use lines
      const fileLines = fileContent.split('\n').filter(line => line !== '');
      const entries = fileLines.map<IndexEntry>(line => ({
        scope,
        language: language as MaterialLanguage,
        text: line,
        aliases: [],
      }));

      this._refArray.push(...entries);
    }

    for (const [index, entry] of this._refArray.entries()) {
      this._documentIndex.add({
        ...entry,
        id: index,
      });
    }
  }

  public async getMaterial(id: string): Promise<MaterialResult> {
    const index = parseInt(id, 10);
    const entry = this._refArray[index];

    if (!entry) {
      throw new Error('Material not found');
    }

    return {
      id,
      text: entry.text,
    };
  }

  public validateId(id: string): boolean {
    const index = parseInt(id, 10);
    return !isNaN(index) && index >= 0 && index < this._refArray.length;
  }
}
