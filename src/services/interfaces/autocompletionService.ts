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
