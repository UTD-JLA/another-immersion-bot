import {Stream} from 'stream';

export interface IAutocompletionService {
  getSuggestions(
    input: string,
    limit: number,
    scope?: string
  ): Promise<string[]>;
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
