import {Schema, model, ObjectId} from 'mongoose';

export enum ActivityType {
  Listening = 'listening',
  Reading = 'reading',
}

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
  type: {type: String, required: true, enum: Object.values(ActivityType)},
  url: {type: String},
  date: {type: Date, required: true},
  duration: {type: Number, required: true, min: 0},
  tags: {type: [String], default: []},
});

schema.pre('save', function (this, next) {
  if (this.isModified('tags') && this.tags) {
    this.tags = this.tags.map(tag => tag.toLowerCase().trim());
    this.tags = [...new Set(this.tags)];
  }

  next();
});

schema.virtual('roundedDuration').get(function (this) {
  return Math.round(this.duration);
});

schema.virtual('formattedDuration').get(function (this) {
  const hours = Math.floor(this.duration / 60);
  const minutes = Math.round(this.duration % 60);

  if (hours === 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
});

export const Activity = model<IActivity>('Activity', schema);
