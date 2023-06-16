import {readFileSync} from 'fs';
import {injectable} from 'inversify';
import {IAutocompletionService} from '../interfaces';
import {IConfig} from '../../config';
import {inject} from 'inversify';

@injectable()
export default class AutocompletionService implements IAutocompletionService {
  private readonly _sortedData: string[];

  constructor(@inject('Config') config: IConfig) {
    this._sortedData = readFileSync(
      config.autocompletionDataFile,
      'utf8'
    ).split('\n');
  }

  public getSuggestions(input: string, limit: number): Promise<string[]> {
    const suggestions: string[] = [];

    for (const data of this._sortedData) {
      if (data.toLowerCase().startsWith(input.toLowerCase())) {
        suggestions.push(data);
      }

      if (suggestions.length >= limit) {
        break;
      }
    }

    return Promise.resolve(suggestions);
  }
}
