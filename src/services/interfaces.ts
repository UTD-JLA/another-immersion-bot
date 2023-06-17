export interface IAutocompletionService {
  getSuggestions(
    input: string,
    limit: number,
    scope?: string
  ): Promise<string[]>;
}

export interface IMaterialSourceService {
  checkForUpdates(): Promise<void>;
}

export interface ILoggerService {
  log(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  child(meta: any): ILoggerService;
}
