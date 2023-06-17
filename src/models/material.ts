import {Schema, model} from 'mongoose';

export enum MaterialType {
  Anime = 'anime',
  VisualNovel = 'vn',
}

export enum MaterialLanguage {
  Japanese = 'ja',
  English = 'en',
}

export interface IMaterial {
  _id?: string;
  title: string;
  type: MaterialType;
  language: MaterialLanguage;
  sourceHash: string;
}

const schema = new Schema<IMaterial>({
  title: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true,
    enum: Object.values(MaterialType),
  },
  language: {
    type: String,
    required: true,
    enum: Object.values(MaterialLanguage),
  },
  sourceHash: {
    type: String,
    required: true,
    index: true,
  },
});

export const Material = model<IMaterial>('Material', schema);
