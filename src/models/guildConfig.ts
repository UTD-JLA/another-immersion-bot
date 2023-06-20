import {Schema, model, ObjectId} from 'mongoose';
import {validateTimezone} from '../util/validation';

export interface IGuildConfig {
  _id?: ObjectId;
  guildId: string;
  timezone?: string;
}

const schema = new Schema<IGuildConfig>({
  guildId: {type: String, required: true},
  timezone: {
    type: String,
    validate: {
      validator: validateTimezone,
      message: 'Invalid timezone',
    },
  },
});

export const GuildConfig = model<IGuildConfig>('GuildConfig', schema);
