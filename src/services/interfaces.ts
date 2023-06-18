import {Stream} from 'stream';

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

export interface IChartService {
  getChartPng(
    title: string,
    xlabel: string,
    ylabel: string,
    xdata: number[],
    ydata: number[],
    grid: boolean
  ): Promise<Stream>;
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
