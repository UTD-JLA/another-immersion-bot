import {drizzle} from 'drizzle-orm/better-sqlite3';
import {migrate} from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import schema from './schema';

const db = drizzle(new Database('botdata.db'), {schema});

migrate(db, {migrationsFolder: './migrations'});

export default db;
