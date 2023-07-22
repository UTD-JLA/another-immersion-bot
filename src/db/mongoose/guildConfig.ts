import {Schema, model} from 'mongoose';
import {validateTimezone} from '../../util/validation';
import {IGuildConfig} from '../../models/guildConfig';

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
