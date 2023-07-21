import {ILoggerService, IMaterialSourceService} from '../interfaces';
import {IMaterial, MaterialType, MaterialLanguage} from '../../models/material';
import {injectable, inject} from 'inversify';
import {IConfig} from '../../config';
import {readFile, readdir} from 'fs/promises';
import {createHash} from 'crypto';
import {materials} from '../../db/drizzle/schema/materials';
import db from '../../db/drizzle';
import {and, eq, inArray, ilike} from 'drizzle-orm';

interface IMaterialsFile {
  path: string;
  hash: string;
  language: MaterialLanguage;
  type: MaterialType;
  content: string[];
}

@injectable()
export default class SqliteMaterialSourceService
  implements IMaterialSourceService
{
  private readonly _materialDataPath: string;
  private readonly _logger: ILoggerService;

  constructor(
    @inject('Config') private readonly config: IConfig,
    @inject('LoggerService') logger: ILoggerService
  ) {
    this._materialDataPath = this.config.materialsPath;
    this._logger = logger;
  }

  public validateId(id: string): boolean {
    // make sure id is numeric
    return !isNaN(Number(id));
  }

  public async search(
    query: string,
    limit: number,
    scope?: string
  ): Promise<{id: string; text: string}[]> {
    // check if substring
    const sqlQuery = scope
      ? and(ilike(materials.title, `%${query}%`), eq(materials.type, scope))
      : ilike(materials.title, `%${query}%`);

    let dbQuery = db
      .select({title: materials.title, id: materials.id})
      .from(materials)
      .where(sqlQuery);

    if (limit) {
      dbQuery = dbQuery.limit(limit);
    }

    const rows = dbQuery.all();

    return rows.map(row => ({
      id: row.id.toString(),
      text: row.title,
    }));
  }

  public async getMaterial(id: string): Promise<{id: string; text: string}> {
    const numberId = Number(id);

    const material = db
      .select({title: materials.title, id: materials.id})
      .from(materials)
      .where(eq(materials.id, numberId))
      .get();

    if (!material) throw new Error(`Material with id ${id} not found`);

    return {
      id: material.id.toString(),
      text: material.title,
    };
  }

  public async checkForUpdates(): Promise<void> {
    const currentHashes = db
      .selectDistinct({sourceHash: materials.sourceHash})
      .from(materials)
      .all()
      .map(row => row.sourceHash);
    const files = await this._getFiles(this._materialDataPath);

    this._logger.debug(
      `Found ${files.length} files in ${this._materialDataPath}`,
      {files: files.map(file => file.path)}
    );

    const newHashes = files.map(file => file.hash);
    const sinceAddedHashes = newHashes.filter(
      hash => !currentHashes.includes(hash)
    );
    const sinceDeletedHashes = currentHashes.filter(
      hash => !newHashes.includes(hash)
    );

    const addedFiles = files.filter(file =>
      sinceAddedHashes.includes(file.hash)
    );

    this._logger.log(
      `Found ${addedFiles.length} new files and ${sinceDeletedHashes.length} deleted files`
    );

    const changes: string[] = [];

    for (const file of addedFiles) {
      changes.push(`+${file.path} -> ${file.hash}`);
    }

    for (const hash of sinceDeletedHashes) {
      changes.push(`-${hash}`);
    }

    this._logger.log('Ready to apply changes', {changes});

    // delete entries from deleted/modified files

    if (sinceDeletedHashes.length > 0) {
      const result = db
        .delete(materials)
        .where(inArray(materials.sourceHash, sinceDeletedHashes))
        .run();

      this._logger.log(
        `Deleted ${
          result.changes
        } entries with hashes ${sinceDeletedHashes.join(', ')}`
      );
    }

    // add entries from added/modified files
    const newEntries = addedFiles.reduce(
      (acc, file) =>
        acc.concat(
          file.content.filter(Boolean).map(title => ({
            title,
            language: file.language,
            type: file.type,
            sourceHash: file.hash,
          }))
        ),
      [] as Omit<IMaterial, 'id'>[]
    );

    // insert in batches of 1000 to avoid call stack size exceeded error
    for (let i = 0; i < newEntries.length; i += 1000) {
      const batch = newEntries.slice(i, i + 1000);
      db.insert(materials).values(batch).run();
    }

    this._logger.log(`Added ${newEntries.length} new entries`);
  }

  private async _getFiles(path: string): Promise<IMaterialsFile[]> {
    const files = await readdir(path);
    const materialData = await Promise.all(
      files.map(async file => {
        const parts = file.split('.');
        if (parts.length < 2) {
          return null;
        }
        const [language, type] = file.split('.').slice(0, -1) as [
          string,
          string
        ];
        if (
          !Object.values(MaterialLanguage).includes(
            language as MaterialLanguage
          )
        ) {
          return null;
        }

        if (!Object.values(MaterialType).includes(type as MaterialType)) {
          return null;
        }
        const content = await readFile(`${path}/${file}`, 'utf8');
        const hash = createHash('sha256')
          .update(content)
          .update(language)
          .update(type)
          .digest('hex');
        return {
          path: file,
          hash,
          language,
          type,
          content: content.split(/\r?\n/),
        };
      })
    );

    return materialData.filter(Boolean) as IMaterialsFile[];
  }
}
