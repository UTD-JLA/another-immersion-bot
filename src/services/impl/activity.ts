import {IActivityService} from '../interfaces';
import {IActivity, ActivityType, ActivityUnit} from '../../models/activity';
import {Activity} from '../../db/mongoose';
import {injectable} from 'inversify';

@injectable()
export default class ActivityService implements IActivityService {
  private readonly _createdListeners: Array<(activity: IActivity) => void>;

  constructor() {
    this._createdListeners = [];
  }

  public async on(
    _event: 'activityCreated',
    listener: (activity: IActivity) => void
  ) {
    this._createdListeners.push(listener);
  }

  public async createActivity(activity: IActivity): Promise<IActivity> {
    const a = await Activity.create(activity);
    // Note: if other programs can write to the database,
    // then it would be better to use MongoDB's change streams
    // but this is fine for now
    this._createdListeners.forEach(listener => listener(a));
    return a;
  }

  public async getActivities(
    userId: string,
    limit?: number
  ): Promise<IActivity[]> {
    const query = Activity.find({userId}).sort({date: -1});

    if (limit) {
      return query.limit(limit).exec();
    } else {
      return query.exec();
    }
  }

  public async getActivityById(activityId: string): Promise<IActivity | null> {
    return await Activity.findById(activityId);
  }

  public async deleteActivityById(activityId: string): Promise<void> {
    await Activity.findByIdAndDelete(activityId);
  }

  public async getActivitiesInDateRange(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<IActivity[]> {
    const query = Activity.find({
      userId,
      date: {
        $gte: startDate,
        $lte: endDate,
      },
    }).sort({date: 1});

    return query.exec();
  }

  public async getTopMembers(
    memberIds: string[],
    limit: number,
    since?: Date,
    type?: ActivityType
  ): Promise<{discordId: string; duration: number}[]> {
    const typeQuery = type ? {type} : {};
    const dateQuery = since ? {date: {$gte: since}} : {};

    const query = Activity.aggregate([
      {
        $match: {
          userId: {
            $in: memberIds,
          },
          ...dateQuery,
          ...typeQuery,
        },
      },
      {
        $group: {
          _id: '$userId',
          duration: {
            $sum: '$duration',
          },
        },
      },
      {
        $sort: {
          duration: -1,
        },
      },
      {
        $limit: limit,
      },
    ]);

    return query.exec().then(docs =>
      docs.map(doc => ({
        discordId: doc._id,
        duration: doc.duration,
      }))
    );
  }

  public async getDailyDurationsInDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
    timezone?: string
  ): Promise<[`${number}-${number}-${number}`, number][]> {
    const tzQuery = timezone ? {$timezone: timezone} : {};

    const query = Activity.aggregate([
      {
        $match: {
          userId,
          date: {
            $gte: startDate,
            $lte: endDate,
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$date',
              ...tzQuery,
            },
          },
          duration: {
            $sum: '$duration',
          },
        },
      },
      {
        $sort: {
          _id: 1,
        },
      },
    ]);

    return query.exec().then(docs => docs.map(doc => [doc._id, doc.duration]));
  }

  public async getSpeedsInDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
    type?: ActivityUnit
  ): Promise<[Date, number][]> {
    const query = Activity.find({
      userId,
      date: {
        $gte: startDate,
        $lte: endDate,
      },
      speed: {$ne: null},
      rawDurationUnit: type,
    })
      .sort({date: 1})
      .select('date speed');

    return query
      .exec()
      .then(docs => docs.map(doc => [doc.date, doc.speed!] as [Date, number]));
  }
}
