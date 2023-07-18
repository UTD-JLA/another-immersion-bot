import {inject, injectable} from 'inversify';
import {
  IAutocompletionService,
  IMaterialSourceService,
  ISuggestion,
  MaterialResult,
} from '../interfaces';
import {ExpiringCache} from '../../util/cache';

@injectable()
export default class AutocompletionService implements IAutocompletionService {
  // limit imposed by Discord API
  private static readonly MAX_STR_LENGTH = 100;
  // regex to match magic values which are used to represent material with long titles
  private static readonly MAGIC_VALUE_REGEX = /^~(?<id>.*)\.title~$/;

  // cache for material titles when they need to be fetched from the database
  private readonly _cache: ExpiringCache<string> = new ExpiringCache(
    1 * 60 * 1000
  );

  private readonly _materialSource: IMaterialSourceService;

  constructor(
    @inject('MaterialSourceService')
    materialSource: IMaterialSourceService
  ) {
    this._materialSource = materialSource;
  }

  private _createSuggestion(material: MaterialResult): ISuggestion {
    const title = material.text;

    if (title.length <= AutocompletionService.MAX_STR_LENGTH) {
      return {
        name: title,
        value: title,
      };
    }

    this._cache.set(material.id, title);

    return {
      name:
        title.substring(0, AutocompletionService.MAX_STR_LENGTH - 3) + '...',
      value: `~${material.id}.title~`,
    };
  }

  public async resolveSuggestion(suggestionValue: string): Promise<string> {
    const match = AutocompletionService.MAGIC_VALUE_REGEX.exec(suggestionValue);

    if (!match) return suggestionValue;

    const materialId = match.groups!.id;
    const isValidId = this._materialSource.validateId(materialId);
    if (!isValidId) return suggestionValue;

    // try to get the title from the cache, otherwise fetch it from the database
    const materialTitle =
      this._cache.get(materialId) ??
      (await this._materialSource
        .getMaterial(materialId)
        .then(material => material.text));

    // not ideal, but it's not possible to tell if this is
    // malicious input or a genuine magic value with an invalid id
    if (!materialTitle) return suggestionValue;

    return materialTitle;
  }

  public async getSuggestions(
    input: string,
    limit: number,
    scope?: string
  ): Promise<ISuggestion[]> {
    const suggestions = await this._materialSource.search(input, limit, scope);
    return suggestions.map(this._createSuggestion.bind(this));
  }
}
