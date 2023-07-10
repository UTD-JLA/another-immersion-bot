import {IActivityService} from '../interfaces';
import {Activity, IActivity, ActivityType} from '../../models/activity';
import {injectable} from 'inversify';

@injectable()
export default class ActivityService implements IActivityService {
  async createActivity(activity: IActivity): Promise<IActivity> {
    return await Activity.create(activity);
  }

  async getActivities(userId: string, limit?: number): Promise<IActivity[]> {
    const query = Activity.find({userId}).sort({date: -1});

    if (limit) {
      return query.limit(limit).exec();
    } else {
      return query.exec();
    }
  }

  async getActivityById(activityId: string): Promise<IActivity | null> {
    return await Activity.findById(activityId);
  }

  async deleteActivityById(activityId: string): Promise<void> {
    await Activity.findByIdAndDelete(activityId);
  }

  async getActivitiesInDateRange(
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

  async getTopMembers(
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

  async getDailyDurationsInDateRange(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<[`${number}-${number}-${number}`, number][]> {
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

  async getSpeedsInDateRange(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<[Date, number][]> {
    const query = Activity.find({
      userId,
      date: {
        $gte: startDate,
        $lte: endDate,
      },
      speed: {$ne: null},
    })
      .sort({date: 1})
      .select('date speed');

    return query
      .exec()
      .then(docs => docs.map(doc => [doc.date, doc.speed!] as [Date, number]));
  }

  async getAverageSpeedInDateRange(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    const query = Activity.aggregate([
      {
        $match: {
          userId,
          date: {
            $gte: startDate,
            $lte: endDate,
          },
          speed: {$ne: null},
        },
      },
      {
        $group: {
          _id: null,
          averageSpeed: {
            $avg: '$speed',
          },
        },
      },
    ]);

    return query.exec().then(docs => docs[0]?.averageSpeed ?? 0);
  }
}
