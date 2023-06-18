import {Schema, model, ObjectId} from 'mongoose';

export enum MaterialType {
  Anime = 'anime',
  VisualNovel = 'vn',
}

export enum MaterialLanguage {
  Japanese = 'ja',
  English = 'en',
}

export interface IMaterial {
  _id?: ObjectId;
  title: string;
  type: MaterialType;
  language: MaterialLanguage;
  sourceHash: string;
}

const schema = new Schema<IMaterial>({
  title: {
    type: String,
    required: true,
    text: true,
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
