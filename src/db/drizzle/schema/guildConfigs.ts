import {sqliteTable, text} from 'drizzle-orm/sqlite-core';

export const guildConfigs = sqliteTable('guild_configs', {
  guildId: text('guild_id').primaryKey(),
  timeZone: text('time_zone'),
});
