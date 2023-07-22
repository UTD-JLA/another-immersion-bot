import {Schema, model} from 'mongoose';
import {IMaterial, MaterialLanguage, MaterialType} from '../../models/material';

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
