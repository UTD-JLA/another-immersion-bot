import Fuse from 'fuse.js';
import {
  ILoggerService,
  IMaterialSourceService,
  MaterialResult,
} from '../interfaces';
import {MaterialLanguage} from '../../models/material';
import {readdir, readFile} from 'fs/promises';
import {inject, injectable} from 'inversify';
import {IConfig} from '../../config';
import {Worker} from 'worker_threads';
import {join, dirname} from 'path';

export type IndexEntry = {
  scope: string;
  language: MaterialLanguage;
  text: string;
  aliases: string[];
};

export type WorkerMessage =
  | {
      type: 'set';
      data: readonly IndexEntry[];
    }
  | {
      type: 'search';
      requestId: number;
      data: {
        query: string;
        limit: number;
        scope?: string;
        language?: MaterialLanguage;
      };
    };

export type WorkerResponse = {
  type: 'search';
  requestId: number;
  data: Fuse.FuseResult<IndexEntry>[];
};

@injectable()
export default class MemoryMaterialSourceService
  implements IMaterialSourceService
{
  private readonly _materialDataPath: string;
  private readonly _logger: ILoggerService;
  private readonly _refArray: IndexEntry[] = [];
  private readonly _freeWorkers: Worker[] = [];
  private readonly _busyWorkers: Worker[] = [];
  private readonly _requestQueue: WorkerMessage[] = [];
  private readonly _callbacks: Map<
    number,
    {
      resolve: (value: Fuse.FuseResult<IndexEntry>[]) => void;
      reject: (reason?: unknown) => void;
    }
  >;
  private _requestId = 0;

  constructor(
    @inject('Config') config: IConfig,
    @inject('LoggerService') logger: ILoggerService
  ) {
    this._callbacks = new Map();
    for (let i = 0; i < config.fuseWorkerCount; i++) {
      this._freeWorkers.push(
        new Worker(
          join(
            process.pkg
              ? join(dirname(process.execPath), 'scripts')
              : __dirname,
            'memoryMaterialSource.worker.js'
          )
        )
      );
    }
    this._materialDataPath = config.materialsPath;
    this._logger = logger;
    for (const worker of this._freeWorkers) {
      this._setupWorker(worker);
    }
  }

  private _setupWorker(worker: Worker) {
    worker.on('message', (event: WorkerResponse) => {
      const {requestId, data} = event;
      this._logger.debug(
        `Received response for request ${requestId} from worker ${worker.threadId}`
      );
      this._callbacks.get(requestId)!.resolve(data);

      const nextMessage = this._requestQueue.shift();

      if (nextMessage) {
        this._logger.debug('Found queued message, posting');
        worker.postMessage(nextMessage);
      } else {
        this._logger.debug('No queued messages, freeing worker');
        this._busyWorkers.splice(this._busyWorkers.indexOf(worker), 1);
        this._freeWorkers.push(worker);
      }
    });
  }

  private _postMessageToPool(message: WorkerMessage) {
    const worker = this._freeWorkers.pop();

    if (worker) {
      this._logger.debug(`Posting message to free worker ${worker.threadId}`);
      this._busyWorkers.push(worker);
      worker.postMessage(message);
    } else {
      this._logger.debug('No free workers, queueing message');
      this._requestQueue.push(message);
    }
  }

  public async checkForUpdates(): Promise<void> {
    const files = await readdir(this._materialDataPath);

    this._logger.debug(`Found ${files.length} files`);

    for (const file of files) {
      const fileNameParts = file.split('.');

      this._logger.debug(`Checking ${file}`);

      if (fileNameParts.length < 2) {
        continue;
      }

      this._logger.debug(`Indexing ${file}`);

      const [language, scope] = fileNameParts;
      const filePath = `${this._materialDataPath}/${file}`;
      const fileContent = await readFile(filePath, 'utf8');
      // groups are seperated by two newlines
      const groups = fileContent.split('\n\n');

      // if this file is in groups, use aliases
      if (groups.length > 1) {
        this._logger.debug(`${file} is in groups, using aliases`);

        const entries = groups.map<IndexEntry>(group => {
          const lines = group.split('\n');
          const text = lines.shift()!;
          const aliases = lines;

          return {
            scope,
            language: language as MaterialLanguage,
            text,
            aliases,
          };
        });

        this._refArray.push(...entries.filter(entry => entry.text !== ''));
        continue;
      }

      // otherwise, use lines
      const fileLines = fileContent.split('\n').filter(line => line !== '');
      const entries = fileLines.map<IndexEntry>(line => ({
        scope,
        language: language as MaterialLanguage,
        text: line,
        aliases: [],
      }));

      this._refArray.push(...entries);
    }

    const allWorkers = [...this._freeWorkers, ...this._busyWorkers];

    for (const worker of allWorkers) {
      worker.postMessage({
        type: 'set',
        data: this._refArray,
      });
    }
  }

  public async search(
    query: string,
    limit: number,
    scope?: string,
    language?: MaterialLanguage
  ): Promise<{id: string; text: string}[]> {
    const requestId = this._requestId++;
    const results = await new Promise<Fuse.FuseResult<IndexEntry>[]>(
      (resolve, reject) => {
        this._callbacks.set(requestId, {resolve, reject});
        this._postMessageToPool({
          type: 'search',
          requestId,
          data: {
            query,
            limit,
            scope,
            language,
          },
        });
      }
    );

    return results.map(result => ({
      id: result.refIndex.toString(),
      text: result.item.text,
    }));
  }

  public async getMaterial(id: string): Promise<MaterialResult> {
    const index = parseInt(id, 10);
    const entry = this._refArray[index];

    if (!entry) {
      throw new Error('Material not found');
    }

    return {
      id,
      text: entry.text,
    };
  }

  public validateId(id: string): boolean {
    const index = parseInt(id, 10);
    return !isNaN(index) && index >= 0 && index < this._refArray.length;
  }
}
