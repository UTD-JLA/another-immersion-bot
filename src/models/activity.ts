import {Schema, model, ObjectId} from 'mongoose';

type ActivityType = 'listening' | 'reading';

export interface IActivity {
  _id?: ObjectId;
  userId: string;
  name: string;
  type: ActivityType;
  url?: string;
  date: Date;
  duration: number;
  tags?: string[];

  // Virtuals
  roundedDuration?: number;
  formattedDuration?: string;
}

const schema = new Schema<IActivity>({
  userId: {type: String, required: true},
  name: {type: String, required: true},
  type: {type: String, required: true},
  url: {type: String},
  date: {type: Date, required: true},
  duration: {type: Number, required: true},
  tags: {type: [String], default: []},
});

schema.virtual('roundedDuration').get(function (this: IActivity) {
  return Math.round(this.duration);
});

schema.virtual('formattedDuration').get(function (this: IActivity) {
  const hours = Math.floor(this.duration / 60);
  const minutes = Math.round(this.duration % 60);

  if (hours === 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
});

export const Activity = model<IActivity>('Activity', schema);
