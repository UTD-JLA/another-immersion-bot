import {Activity} from './db/mongoose/activity';
import {GuildConfig} from './db/mongoose';
import {UserConfig} from './db/mongoose/userConfig';
import {connect} from 'mongoose';
import {createDb} from './db/drizzle';
import {
  activities,
  tags,
  tagsToActivities,
} from './db/drizzle/schema/activities';
import {guildConfigs} from './db/drizzle/schema/guildConfigs';
import {userConfigs} from './db/drizzle/schema/userConfigs';
import {migrate} from 'drizzle-orm/better-sqlite3/migrator';
import {dirname} from 'path';
import {eq, inArray, InferModel} from 'drizzle-orm';
import {IActivity} from './models/activity';

type SqliteDB = ReturnType<typeof createDb>;

function createInsert(
  activitiy: IActivity
): InferModel<typeof activities, 'insert'> {
  return {
    id: activitiy.id,
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

async function pullActivities(db: SqliteDB): Promise<[number, number]> {
  let found = 0;
  let inserted = 0;

  for await (const activity of Activity.find()) {
    found++;

    console.log(`Pulling activity ${activity.id}`);

    const match = db
      .select({
        id: activities.id,
      })
      .from(activities)
      .where(eq(activities.id, activity.id))
      .get();

    if (match) {
      console.log(`Activity ${activity.id} already exists`);
      continue;
    }

    const newActivity = createInsert(activity);
    const newTags = activity.tags ?? [];

    db.transaction(tx => {
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
    inserted++;
  }

  return [found, inserted];
}

async function pullGuildConfigs(db: SqliteDB): Promise<[number, number]> {
  let found = 0;
  let inserted = 0;

  for await (const guildConfig of GuildConfig.find()) {
    found++;

    console.log(`Pulling guild config ${guildConfig.guildId}`);

    const result = db
      .insert(guildConfigs)
      .values({guildId: guildConfig.guildId, timeZone: guildConfig.timezone})
      .onConflictDoNothing()
      .run();

    console.log(`Guild config ${guildConfig.guildId} pulled`);

    inserted += result.changes;
  }

  return [found, inserted];
}

async function pullUserConfigs(db: SqliteDB): Promise<[number, number]> {
  let found = 0;
  let inserted = 0;

  for await (const userConfig of UserConfig.find()) {
    found++;

    console.log(`Pulling user config ${userConfig.userId}`);

    const result = db
      .insert(userConfigs)
      .values({
        userId: userConfig.userId,
        timeZone: userConfig.timezone,
        readingSpeed: userConfig.readingSpeed,
        readingSpeedPages: userConfig.readingSpeedPages,
        dailyGoal: userConfig.dailyGoal,
      })
      .onConflictDoNothing()
      .run();

    console.log(`User config ${userConfig.userId} pulled`);

    inserted += result.changes;
  }

  return [found, inserted];
}

export async function pullAll(
  mongoUrl: string,
  sqlitePath: string
): Promise<void> {
  const db = createDb(sqlitePath);
  migrate(db, {
    migrationsFolder: process.pkg
      ? dirname(process.execPath) + '/migrations'
      : __dirname + '/../migrations',
  });

  const conn = await connect(mongoUrl);

  try {
    const [activitiesFound, activitiesInserted] = await pullActivities(db);
    const [guildConfigsFound, guildConfigsInserted] = await pullGuildConfigs(
      db
    );
    const [userConfigsFound, userConfigsInserted] = await pullUserConfigs(db);

    console.log(
      `Done. Pulled ${activitiesFound} activities (${activitiesInserted} new), ${guildConfigsFound} guild configs (${guildConfigsInserted} new), ${userConfigsFound} user configs (${userConfigsInserted} new)`
    );
  } finally {
    await conn.disconnect();
  }
}
