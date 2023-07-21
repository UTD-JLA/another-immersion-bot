import {sqliteTable, text, integer} from 'drizzle-orm/sqlite-core';

export const userConfigs = sqliteTable('user_configs', {
  userId: text('user_id').primaryKey(),
  timeZone: text('time_zone'),
  readingSpeed: integer('reading_speed'),
  readingSpeedPages: integer('reading_speed_pages'),
  dailyGoal: integer('daily_goal'),
});
