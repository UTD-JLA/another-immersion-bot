import {Schema, model} from 'mongoose';
import {validateTimezone} from '../../util/validation';
import {IUserConfig} from '../../models/userConfig';

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
  readingSpeedPages: {
    type: Number,
    min: 0,
    max: 20,
  },
  dailyGoal: {
    type: Number,
    min: 0,
    max: 1440,
  },
});

export const UserConfig = model<IUserConfig>('UserConfig', schema);
