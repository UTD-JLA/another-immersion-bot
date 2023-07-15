import * as fs from 'fs';
import {z} from 'zod';
import {dirname} from 'path';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    // add pkg to process object
    interface Process {
      pkg?: {
        entrypoint: string;
        defaultEntrypoint: string;
      };
    }
  }
}

export interface IColorConfig {
  primary: `#${string}`;
  secondary: `#${string}`;
  error: `#${string}`;
  warning: `#${string}`;
  info: `#${string}`;
  success: `#${string}`;
}

export interface IConfig {
  logLevel: string;
  materialsPath: string;
  token: string;
  mongoUrl: string;
  chartServiceUrl: string;
  localesPath: string;
  maxYtdlProcesses?: number;
  proccessAcquisitionTimeout?: number;
  speedCacheTtl?: number;
  speedCacheClearEvery?: number;
  speedLookbackDays?: number;
  speedLowestWeight?: number;
  colors: IColorConfig;
}

export const ConfigSchema = z.object({
  logLevel: z
    .enum(['debug', 'info', 'warn', 'error'])
    .describe('The log level to use')
    .default('info'),
  materialsPath: z
    .string()
    .describe(
      'The path to the materials directory. Should contain text files' +
        '(named LANG_CODE.TYPE.ETC.txt, ex. en.anime.mal.txt) of line seperated titles to be used for autocompletion'
    )
    .default(
      // do not package materials with pkg
      // instead, use the materials directory in the same directory as the executable
      process.pkg ? dirname(process.execPath) + '/data' : __dirname + '/../data'
    ),
  token: z.string().describe('The bot token to use'),
  mongoUrl: z
    .string()
    .url()
    .describe('The MongoDB URL to use')
    .default('mongodb://localhost:27017'),
  chartServiceUrl: z
    .string()
    .url()
    .describe('The chart service URL to use')
    .default('http://127.0.0.1:5301/bar'),
  localesPath: z
    .string()
    .describe('The path to the locales directory')
    .default(
      // do not package locales with pkg
      // instead, use the locales directory in the same directory as the executable
      process.pkg
        ? dirname(process.execPath) + '/locales'
        : __dirname + '/../locales'
    ),
  maxYtdlProcesses: z
    .number()
    .min(0)
    .optional()
    .describe('The max number of yt-dlp processes to run at once'),
  proccessAcquisitionTimeout: z
    .number()
    .min(0)
    .optional()
    .describe('The max time to wait for a yt-dlp process to become available'),
  speedCacheTtl: z
    .number()
    .min(0)
    .optional()
    .describe("How long to cache a user's speed once calculated (ms)"),
  speedCacheClearEvery: z
    .number()
    .min(1)
    .optional()
    .describe(
      'How many activities with concrete speeds are need to force a cache clear for a user'
    ),
  speedLookbackDays: z
    .number()
    .min(0)
    .optional()
    .describe('How many days to look back for speed calculation'),
  speedLowestWeight: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Lowest weight assigned to a historical speed value (0-1)'),
  colors: z
    .object({
      primary: z.string().regex(/^#[0-9a-f]{6}$/i),
      secondary: z.string().regex(/^#[0-9a-f]{6}$/i),
      error: z.string().regex(/^#[0-9a-f]{6}$/i),
      warning: z.string().regex(/^#[0-9a-f]{6}$/i),
      info: z.string().regex(/^#[0-9a-f]{6}$/i),
      success: z.string().regex(/^#[0-9a-f]{6}$/i),
    })
    .default({
      primary: '#F3B6AF',
      secondary: '#ECD1A0',
      success: '#369e42',
      error: '#e03838',
      warning: '#edb63e',
      info: '#578bf2',
    })
    .describe('The colors to used for embeds and images'),
});

// get fields and descriptions from schema
export const ConfigFields = Object.entries(ConfigSchema.shape)
  .map(([key, value]) => ({
    name: key,
    description: value.description,
    optional: value.isOptional(),
  }))
  .sort((a, b) => {
    // sort by required then alphabetically
    if (a.optional && !b.optional) return 1;
    if (!a.optional && b.optional) return -1;
    return a.name.localeCompare(b.name);
  });

export class Config implements IConfig {
  constructor(
    public readonly token: string,
    public readonly logLevel = 'info',
    public readonly materialsPath = __dirname + '/../data',
    public readonly mongoUrl = 'mongodb://localhost:27017',
    public readonly chartServiceUrl = 'http://127.0.0.1:5301/bar',
    public readonly localesPath = __dirname + '/../locales',
    public readonly colors: IColorConfig = {
      primary: '#F3B6AF',
      secondary: '#ECD1A0',
      success: '#369e42',
      error: '#e03838',
      warning: '#edb63e',
      info: '#578bf2',
    },
    public readonly maxYtdlProcesses?: number,
    public readonly proccessAcquisitionTimeout?: number,
    public readonly speedCacheTtl?: number,
    public readonly speedCacheClearEvery?: number,
    public readonly speedLookbackDays?: number,
    public readonly speedLowestWeight?: number
  ) {}

  public static getStandardConfig(): Config {
    const initials = Config.getInitialsFromEnv();
    const file = process.env.IB_CONFIG_LOCATION || 'config.json';
    return Config.fromJsonFile(file, initials);
  }

  public static getInitialsFromEnv(): Partial<IConfig> {
    const initials: Partial<IConfig> = {};

    if (process.env['IB_TOKEN']) initials.token = process.env['IB_TOKEN'];
    if (process.env['IB_LOG_LEVEL'])
      initials.logLevel = process.env['IB_LOG_LEVEL'];
    if (process.env['IB_MATERIALS_PATH'])
      initials.materialsPath = process.env['IB_MATERIALS_PATH'];
    if (process.env['IB_MONGO_URL'])
      initials.mongoUrl = process.env['IB_MONGO_URL'];
    if (process.env['IB_CHART_SERVICE_URL'])
      initials.chartServiceUrl = process.env['IB_CHART_SERVICE_URL'];
    if (process.env['IB_LOCALES_PATH'])
      initials.localesPath = process.env['IB_LOCALES_PATH'];

    return initials;
  }

  public static fromJsonFile(
    path: string,
    initials: Partial<IConfig> = {}
  ): Config {
    const defaults = Object.assign({}, initials);

    const defaultsResult = ConfigSchema.safeParse(defaults);
    const defaultsAreSufficient = defaultsResult.success;

    if (!fs.existsSync(path) && !defaultsAreSufficient) {
      throw new Error(
        `Config file not found at ${path} and insufficient defaults provided: ${defaultsResult.error.message}`
      );
    }

    let fileConfig: Partial<IConfig> = {};

    try {
      fileConfig = JSON.parse(fs.readFileSync(path, 'utf8'));
    } catch (e) {
      if (!defaultsAreSufficient) {
        throw new Error(
          `Config file at ${path} could not be parsed and insufficient defaults provided: ${defaultsResult.error.message}`
        );
      }
    }

    const partialConfig: Partial<IConfig> = {
      ...defaults,
      ...fileConfig,
    };

    const result = ConfigSchema.safeParse(partialConfig);

    if (!result.success) {
      throw new Error(
        `Invalid config file at ${path}: ${result.error.message}`
      );
    }

    const config = result.data;

    return new Config(
      config.token,
      config.logLevel,
      config.materialsPath,
      config.mongoUrl,
      config.chartServiceUrl,
      config.localesPath,
      // zod doesn't recognize that the fields match `#${string}`
      config.colors as IColorConfig,
      config.maxYtdlProcesses,
      config.proccessAcquisitionTimeout,
      config.speedCacheTtl,
      config.speedCacheClearEvery,
      config.speedLookbackDays,
      config.speedLowestWeight
    );
  }
}
