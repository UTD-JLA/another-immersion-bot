import {readFile} from 'fs';
import {promisify} from 'util';

export interface IAutocompletionService {
  getSuggestions(input: string, limit: number): Promise<string[]>;
}

const readFileAsync = promisify(readFile);

export default class AutocompletionService implements IAutocompletionService {
  constructor(private readonly _sortedData: string[]) {}

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

  public static async fromSortedFile(
    path: string
  ): Promise<AutocompletionService> {
    const fileContent = await readFileAsync(path, 'utf-8');
    const sortedData = fileContent.split('\n');

    return new AutocompletionService(sortedData);
  }
}
