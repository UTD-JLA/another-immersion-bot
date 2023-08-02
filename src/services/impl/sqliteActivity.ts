import {
  IActivityService,
  ILoggerService,
  IUserConfigService,
} from '../interfaces';
import {IActivity, ActivityType, ActivityUnit} from '../../models/activity';
import {inject, injectable} from 'inversify';
import {getDb} from '../../db/drizzle';
import {
  activities,
  tags,
  tagsToActivities,
} from '../../db/drizzle/schema/activities';
import {
  eq,
  desc,
  InferModel,
  inArray,
  sql,
  gte,
  lte,
  and,
  isNotNull,
} from 'drizzle-orm';
// For now we use mongoose's ObjectId to generate IDs
// so they are easily migrated from and to MongoDB
import {Types} from 'mongoose';
import {getUTCOffset} from '../../util/time';

@injectable()
export default class SqliteActivityService implements IActivityService {
  private readonly _createdListeners: Array<(activity: IActivity) => void>;

  constructor(
    @inject('LoggerService') private readonly _loggerService: ILoggerService,
    @inject('UserConfigService')
    private readonly _userConfigService: IUserConfigService
  ) {
    this._createdListeners = [];
  }

  public async on(
    _event: 'activityCreated',
    listener: (activity: IActivity) => void
  ) {
    this._createdListeners.push(listener);
  }

  private _newModelToInsert(
    activitiy: Omit<IActivity, 'id'>
  ): InferModel<typeof activities, 'insert'> {
    const id = new Types.ObjectId().toHexString();
    return {
      id,
      userId: activitiy.userId,
      name: activitiy.name,
      type: activitiy.type,
      url: activitiy.url,
      date: activitiy.date.getTime(),
      duration: activitiy.duration,
      rawDuration: activitiy.rawDuration,
      rawDurationUnit: activitiy.rawDurationUnit,
      speed: activitiy.speed,
    };
  }

  public createActivity(activity: Omit<IActivity, 'id'>): Promise<IActivity> {
    const newActivity = this._newModelToInsert(activity);
    const newTags = [...new Set(activity.tags ?? [])];

    this._loggerService.debug(
      `Creating activity ${newActivity.id} for user ${newActivity.userId}`
    );

    getDb().transaction(tx => {
      let tagIds: number[] = [];

      if (newTags.length > 0) {
        tx.insert(tags)
          .values(newTags.map(tag => ({name: tag})))
          .onConflictDoNothing()
          .run();

        tagIds = tx
          .select({id: tags.id})
          .from(tags)
          .where(inArray(tags.name, newTags))
          .all()
          .map(t => t.id);
      }

      tx.insert(activities).values(newActivity).run();

      if (tagIds.length > 0) {
        tx.insert(tagsToActivities)
          .values(
            tagIds.map(tagId => ({
              tagId,
              activityId: newActivity.id,
            }))
          )
          .onConflictDoNothing()
          .run();
      }
    });

    const a = {
      ...activity,
      id: newActivity.id,
    };

    this._createdListeners.forEach(listener => listener(a));

    this._loggerService.debug(`Activity ${a.id} for user ${a.userId}`, {
      activity: a,
    });

    return Promise.resolve(a);
  }

  public getActivities(userId: string, limit?: number): Promise<IActivity[]> {
    let query = getDb()
      .select({
        id: activities.id,
        userId: activities.userId,
        name: activities.name,
        type: activities.type,
        url: activities.url,
        date: activities.date,
        duration: activities.duration,
        rawDuration: activities.rawDuration,
        rawDurationUnit: activities.rawDurationUnit,
        speed: activities.speed,
        tags: sql<
          string[]
        >`'[' || GROUP_CONCAT(json_quote(${tags.name})) || ']'`
          .mapWith(JSON.parse)
          .as('tags'),
      })
      .from(activities)
      .leftJoin(
        tagsToActivities,
        eq(activities.id, tagsToActivities.activityId)
      )
      .leftJoin(tags, eq(tags.id, tagsToActivities.tagId))
      .where(eq(activities.userId, userId))
      .groupBy(activities.id)
      .orderBy(desc(activities.date));

    if (limit) {
      query = query.limit(limit);
    }

    const rows = query.all();

    return Promise.resolve(
      rows.map(row => ({
        id: row.id,
        userId: row.userId,
        name: row.name,
        type: row.type as ActivityType,
        url: row.url ?? undefined,
        date: new Date(row.date),
        duration: row.duration,
        rawDuration: row.rawDuration ?? undefined,
        rawDurationUnit: row.rawDurationUnit as ActivityUnit,
        speed: row.speed ?? undefined,
        tags: row.tags[0] === null ? [] : row.tags,
      }))
    );
  }

  public deleteActivityById(activityId: string): Promise<void> {
    this._loggerService.debug(`Deleting activity ${activityId}`);

    getDb().transaction(tx => {
      tx.delete(tagsToActivities)
        .where(eq(tagsToActivities.activityId, activityId))
        .run();
      tx.delete(activities).where(eq(activities.id, activityId)).run();
    });

    return Promise.resolve();
  }

  public getActivityById(activityId: string): Promise<IActivity | null> {
    const row = getDb()
      .select({
        id: activities.id,
        userId: activities.userId,
        name: activities.name,
        type: activities.type,
        url: activities.url,
        date: activities.date,
        duration: activities.duration,
        rawDuration: activities.rawDuration,
        rawDurationUnit: activities.rawDurationUnit,
        speed: activities.speed,
        tags: sql<
          string[]
        >`'[' || GROUP_CONCAT(json_quote(${tags.name})) || ']'`
          .mapWith(JSON.parse)
          .as('tags'),
      })
      .from(activities)
      .leftJoin(
        tagsToActivities,
        eq(activities.id, tagsToActivities.activityId)
      )
      .leftJoin(tags, eq(tags.id, tagsToActivities.tagId))
      .where(eq(activities.id, activityId))
      .groupBy(activities.id)
      .get();

    if (!row) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      id: row.id,
      userId: row.userId,
      name: row.name,
      type: row.type as ActivityType,
      url: row.url ?? undefined,
      date: new Date(row.date),
      duration: row.duration,
      rawDuration: row.rawDuration ?? undefined,
      rawDurationUnit: row.rawDurationUnit as ActivityUnit,
      speed: row.speed ?? undefined,
      tags: row.tags[0] === null ? [] : row.tags,
    });
  }

  public getTopMembers(
    memberIds: string[],
    limit: number,
    since?: Date,
    type?: ActivityType
  ): Promise<{discordId: string; duration: number}[]> {
    if (memberIds.length === 0) {
      return Promise.resolve([]);
    }

    let query = inArray(activities.userId, memberIds);

    if (since) {
      const newQuery = and(query, gte(activities.date, since.getTime()));
      if (newQuery) {
        query = newQuery;
      }
    }

    if (type) {
      const newQuery = and(query, eq(activities.type, type));
      if (newQuery) {
        query = newQuery;
      }
    }

    const rows = getDb()
      .select({
        userId: activities.userId,
        duration: sql<number>`SUM(${activities.duration})`,
      })
      .from(activities)
      .where(query)
      .groupBy(activities.userId)
      .orderBy(desc(sql`SUM(${activities.duration})`))
      .limit(limit)
      .all();

    return Promise.resolve(
      rows.map(row => ({
        discordId: row.userId,
        duration: row.duration,
      }))
    );
  }

  public getActivitiesInDateRange(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<IActivity[]> {
    const rows = getDb()
      .select({
        id: activities.id,
        userId: activities.userId,
        name: activities.name,
        type: activities.type,
        url: activities.url,
        date: activities.date,
        duration: activities.duration,
        rawDuration: activities.rawDuration,
        rawDurationUnit: activities.rawDurationUnit,
        speed: activities.speed,
        tags: sql<
          string[]
        >`'[' || GROUP_CONCAT(json_quote(${tags.name})) || ']'`
          .mapWith(JSON.parse)
          .as('tags'),
      })
      .from(activities)
      .leftJoin(
        tagsToActivities,
        eq(activities.id, tagsToActivities.activityId)
      )
      .leftJoin(tags, eq(tags.id, tagsToActivities.tagId))
      .where(
        and(
          eq(activities.userId, userId),
          and(
            gte(activities.date, startDate.getTime()),
            lte(activities.date, endDate.getTime())
          )
        )
      )
      .groupBy(activities.id)
      .orderBy(desc(activities.date))
      .all();

    return Promise.resolve(
      rows.map(row => ({
        id: row.id,
        userId: row.userId,
        name: row.name,
        type: row.type as ActivityType,
        url: row.url ?? undefined,
        date: new Date(row.date),
        duration: row.duration,
        rawDuration: row.rawDuration ?? undefined,
        rawDurationUnit: row.rawDurationUnit as ActivityUnit,
        speed: row.speed ?? undefined,
        tags: row.tags[0] === null ? [] : row.tags,
      }))
    );
  }

  public getSpeedsInDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
    type?: ActivityUnit
  ): Promise<Array<[Date, number]>> {
    let query = and(
      and(eq(activities.userId, userId), isNotNull(activities.speed)),
      and(
        gte(activities.date, startDate.getTime()),
        lte(activities.date, endDate.getTime())
      )
    );

    if (type) {
      query = and(query, eq(activities.rawDurationUnit, type));
    }

    const rows = getDb()
      .select({
        date: activities.date,
        speed: activities.speed,
      })
      .from(activities)
      .where(query)
      .orderBy(activities.date)
      .all();

    return Promise.resolve(
      rows.map(row => [new Date(row.date), row.speed] as [Date, number])
    );
  }

  public async getDailyDurationsInDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
    timezone?: string
  ): Promise<Array<[`${number}-${number}-${number}`, number]>> {
    const offsetMinutes = timezone ? getUTCOffset(timezone) : 0;
    const offsetMilliseconds = offsetMinutes * 60 * 1000;

    const rows = getDb()
      .select({
        duration: sql<number>`SUM(${activities.duration})`,
        dateString: sql<`${number}-${number}-${number}`>`strftime('%Y-%m-%d', (${activities.date} + ${offsetMilliseconds}) / 1000, 'unixepoch')`,
      })
      .from(activities)
      .where(
        and(
          eq(activities.userId, userId),
          and(
            gte(activities.date, startDate.getTime()),
            lte(activities.date, endDate.getTime())
          )
        )
      )
      .groupBy(({dateString}) => dateString)
      .orderBy(activities.date)
      .all();

    return rows.map(row => [row.dateString, row.duration]);
  }
}
