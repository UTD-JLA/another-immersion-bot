import {drizzle} from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import schema from './schema';
import {dirname} from 'path';

const options: Database.Options = process.pkg
  ? {nativeBinding: dirname(process.execPath) + '/better_sqlite3.node'}
  : {};

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function createDb(path: string) {
  db = drizzle(new Database(path, options), {schema});
  return db;
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized! getDb() called too early');
  }
  return db;
}

export {createDb, getDb};
