import {model, Schema} from 'mongoose';
import {
  IActivity,
  ActivityType,
  ActivitySubtype,
  ActivityUnit,
} from '../../models/activity';

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

schema.virtual('roundedDuration').get(function (this) {
  return Math.round(this.duration);
});

schema.virtual('formattedDuration').get(function (this) {
  const days = Math.floor(this.duration / 1440);
  const hours = Math.floor((this.duration - days * 1440) / 60);
  const minutes = Math.round(this.duration - days * 1440 - hours * 60);

  if (days === 0 && hours === 0) {
    return `${minutes}m`;
  }

  if (days === 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${days}d ${hours}h ${minutes}m`;
});

schema
  .virtual('subtype')
  .get(function (this) {
    if (!this.tags) {
      return null;
    }

    for (const tag of this.tags) {
      for (const subtype of Object.values(ActivitySubtype)) {
        if (tag === subtype) {
          return subtype;
        }
      }
    }

    return null;
  })
  .set(function (this, subtype) {
    if (!this.tags) {
      this.tags = [];
    }

    // Remove all subtypes from tags
    this.tags = this.tags.filter(
      tag => !(Object.values(ActivitySubtype) as string[]).includes(tag)
    );

    // Add new subtype to tags
    if (subtype) {
      this.tags.push(subtype);
    }
  });

export const Activity = model<IActivity>('Activity', schema);
