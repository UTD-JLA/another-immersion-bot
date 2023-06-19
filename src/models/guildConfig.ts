import {Schema, model, ObjectId} from 'mongoose';

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

function validateTimezone(timeZone: string) {
  try {
    Intl.DateTimeFormat(undefined, {timeZone});
    return true;
  } catch (e) {
    return false;
  }
}

export const GuildConfig = model<IGuildConfig>('GuildConfig', schema);
