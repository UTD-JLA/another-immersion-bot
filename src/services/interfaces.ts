export interface IAutocompletionService {
  getSuggestions(
    input: string,
    limit: number,
    scope?: string
  ): Promise<string[]>;
}
