import {relations} from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/sqlite-core';

export const tags = sqliteTable(
  'tags',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    name: text('name').notNull().unique(),
  },
  tags => ({
    nameIndex: uniqueIndex('name_index').on(tags.name),
  })
);

export const activities = sqliteTable(
  'activities',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    url: text('url'),
    date: integer('date').notNull(),
    duration: integer('duration').notNull(),
    rawDuration: integer('raw_duration'),
    rawDurationUnit: text('raw_duration_unit'),
    speed: integer('speed'),
  },
  activities => ({
    userIdIndex: index('user_id_index').on(activities.userId),
    dateIndex: index('date_index').on(activities.date),
  })
);

export const tagsToActivities = sqliteTable(
  'tags_to_activities',
  {
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id),
    activityId: text('activity_id')
      .notNull()
      .references(() => activities.id),
  },
  t => ({
    pk: primaryKey(t.activityId, t.tagId),
  })
);

export const tagsRelations = relations(tags, ({many}) => ({
  tagsToActivities: many(tagsToActivities),
}));

export const activitiesRelations = relations(activities, ({many}) => ({
  tagsToActivities: many(tagsToActivities),
}));

export const tagsToActivitiesRelations = relations(
  tagsToActivities,
  ({one}) => ({
    tags: one(tags, {
      fields: [tagsToActivities.tagId],
      references: [tags.id],
    }),
    activities: one(activities, {
      fields: [tagsToActivities.activityId],
      references: [activities.id],
    }),
  })
);
