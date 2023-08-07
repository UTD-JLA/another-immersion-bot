import {MaterialLanguage} from '../../models/material';

export type MaterialResult = {id: string; text: string};

export interface IMaterialSourceService {
  validateId(id: string): boolean;
  checkForUpdates(): Promise<void>;
  search(
    text: string,
    limit: number,
    scope?: string,
    locale?: MaterialLanguage
  ): Promise<MaterialResult[]>;
  getMaterial(id: string): Promise<MaterialResult>;
}
