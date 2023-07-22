import {sqliteTable, text, integer} from 'drizzle-orm/sqlite-core';

export const materials = sqliteTable('materials', {
  id: integer('id').primaryKey({autoIncrement: true}),
  title: text('title').notNull(),
  type: text('type').notNull(),
  language: text('language').notNull(),
  sourceHash: text('source_hash').notNull(),
});
