import {injectable} from 'inversify';
import {IAutocompletionService, ISuggestion} from '../interfaces';
import {Material, IMaterial} from '../../models/material';
import {ExpiringCache} from '../../util/cache';

@injectable()
export default class AutocompletionService implements IAutocompletionService {
  // limit imposed by Discord API
  private static readonly MAX_STR_LENGTH = 100;
  // regex to match magic values which are used to represent material with long titles
  private static readonly MAGIC_VALUE_REGEX = /^~(?<id>[a-f\d]{24})\.title~$/;

  // cache for material titles when they need to be fetched from the database
  private readonly _cache: ExpiringCache<string> = new ExpiringCache(
    1 * 60 * 1000
  );

  private _createSuggestion(material: IMaterial): ISuggestion {
    const title = material.title;

    if (title.length <= AutocompletionService.MAX_STR_LENGTH) {
      return {
        name: title,
        value: title,
      };
    }

    this._cache.set(material._id!.toString(), title);

    return {
      name:
        title.substring(0, AutocompletionService.MAX_STR_LENGTH - 3) + '...',
      value: `~${material._id}.title~`,
    };
  }

  public async resolveSuggestion(suggestionValue: string): Promise<string> {
    const match = AutocompletionService.MAGIC_VALUE_REGEX.exec(suggestionValue);

    if (!match) return suggestionValue;

    const materialId = match.groups!.id;

    // try to get the title from the cache, otherwise fetch it from the database
    const materialTitle =
      this._cache.get(materialId) ??
      (await Material.findById(materialId).then(m => m?.title));

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
    const typeFilter = scope ? {type: scope} : {};

    const suggestions = await Material.find({
      $text: {
        $search: input,
      },
      ...typeFilter,
    })
      .sort({
        score: {
          $meta: 'textScore',
        },
      })
      .limit(limit)
      .exec();

    return suggestions.map(this._createSuggestion.bind(this));
  }
}
