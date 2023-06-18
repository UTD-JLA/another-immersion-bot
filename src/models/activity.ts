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

export const Activity = model<IActivity>('Activity', schema);
