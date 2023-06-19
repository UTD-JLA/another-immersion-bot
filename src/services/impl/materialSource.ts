import {ILoggerService, IMaterialSourceService} from '../interfaces';
import {
  Material,
  IMaterial,
  MaterialType,
  MaterialLanguage,
} from '../../models/material';
import {injectable, inject} from 'inversify';
import {IConfig} from '../../config';
import {readFile, readdir} from 'fs';
import {createHash} from 'crypto';
import {promisify} from 'util';

const readFileAsync = promisify(readFile);
const readdirAsync = promisify(readdir);

interface IMaterialsFile {
  path: string;
  hash: string;
  language: MaterialLanguage;
  type: MaterialType;
  content: string[];
}

@injectable()
export default class MaterialSourceService implements IMaterialSourceService {
  private readonly _materialDataPath: string;
  private readonly _logger: ILoggerService;

  constructor(
    @inject('Config') private readonly config: IConfig,
    @inject('LoggerService') logger: ILoggerService
  ) {
    this._materialDataPath = this.config.materialsPath;
    this._logger = logger;
  }

  public async checkForUpdates(): Promise<void> {
    const currentHashes = await Material.distinct('sourceHash');
    const files = await this._getFiles(this._materialDataPath);
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
    const result = await Material.deleteMany({
      sourceHash: {$in: sinceDeletedHashes},
    });
    this._logger.log(
      `Deleted ${
        result.deletedCount
      } entries with hashes ${sinceDeletedHashes.join(', ')}`
    );

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
      [] as IMaterial[]
    );

    await Material.insertMany(newEntries);

    this._logger.log(`Added ${newEntries.length} new entries`);
  }

  private async _getFiles(path: string): Promise<IMaterialsFile[]> {
    const files = await readdirAsync(path);
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
        const content = await readFileAsync(`${path}/${file}`, 'utf8');
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
          content: content.split('\n'),
        };
      })
    );

    return materialData.filter(Boolean) as IMaterialsFile[];
  }
}
