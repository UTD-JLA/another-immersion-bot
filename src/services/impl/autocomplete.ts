import {injectable} from 'inversify';
import {IAutocompletionService} from '../interfaces';
import {Material} from '../../models/material';

@injectable()
export default class AutocompletionService implements IAutocompletionService {
  public async getSuggestions(
    input: string,
    limit: number,
    scope?: string
  ): Promise<string[]> {
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

    return suggestions.map(suggestion => suggestion.title);
  }
}
