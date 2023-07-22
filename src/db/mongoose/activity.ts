import {model, Schema} from 'mongoose';
import {IActivity, ActivityType, ActivityUnit} from '../../models/activity';

const schema = new Schema<IActivity>({
  userId: {type: String, required: true},
  name: {type: String, required: true},
  type: {type: String, required: true, enum: Object.values(ActivityType)},
  url: {type: String},
  date: {type: Date, required: true},
  duration: {type: Number, required: true, min: 0},
  tags: {type: [String], default: []},
  rawDuration: {type: Number, min: 0},
  rawDurationUnit: {type: String, enum: Object.values(ActivityUnit)},
  speed: {type: Number, min: 0},
});

schema.pre('save', function (this, next) {
  if (this.isModified('tags') && this.tags) {
    this.tags = this.tags.map(tag => tag.trim());
    this.tags = [...new Set(this.tags)];
  }

  next();
});

export const Activity = model<IActivity>('Activity', schema);
