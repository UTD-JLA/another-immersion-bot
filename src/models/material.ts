export enum MaterialType {
  Anime = 'anime',
  VisualNovel = 'vn',
}

export enum MaterialLanguage {
  Japanese = 'ja',
  English = 'en',
}

export interface IMaterial {
  id: string;
  title: string;
  type: MaterialType;
  language: MaterialLanguage;
  sourceHash: string;
}
