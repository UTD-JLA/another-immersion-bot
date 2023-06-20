import {Schema, model, ObjectId} from 'mongoose';
import {validateTimezone} from '../util/validation';

export interface IUserConfig {
  _id?: ObjectId;
  userId: string;
  timezone?: string;
  readingSpeed?: number;
}

const schema = new Schema<IUserConfig>({
  userId: {type: String, required: true},
  timezone: {
    type: String,
    validate: {
      validator: validateTimezone,
      message: 'Invalid timezone',
    },
  },
  readingSpeed: {
    type: Number,
    min: 0,
    max: 1000,
  },
});

export const UserConfig = model<IUserConfig>('UserConfig', schema);
