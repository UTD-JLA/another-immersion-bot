import {IActivity, ActivityType, ActivityUnit} from '../../models/activity';

export interface IActivityService {
  createActivity(activity: Omit<IActivity, 'id'>): Promise<IActivity>;
  deleteActivityById(activityId: string): Promise<void>;
  getActivityById(activityId: string): Promise<IActivity | null>;
  getActivities(userId: string, limit?: number): Promise<IActivity[]>;
  getTopMembers(
    memberIds: string[],
    limit: number,
    since?: Date,
    type?: ActivityType
  ): Promise<{discordId: string; duration: number}[]>;
  getActivitiesInDateRange(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<IActivity[]>;
  getSpeedsInDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
    type?: ActivityUnit
  ): Promise<Array<[Date, number]>>;
  getDailyDurationsInDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
    timezone?: string
  ): Promise<Array<[`${number}-${number}-${number}`, number]>>;
  on(event: 'activityCreated', listener: (activity: IActivity) => void): void;
}
