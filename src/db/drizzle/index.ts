import {drizzle} from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import schema from './schema';
import {dirname} from 'path';

const options: Database.Options = process.pkg
  ? {nativeBinding: dirname(process.execPath) + '/better_sqlite3.node'}
  : {};
const database = new Database('botdata.db', options);
const db = drizzle(database, {schema});

export default db;
