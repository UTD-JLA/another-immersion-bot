import * as fs from 'fs';

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
  colors: IColorConfig;
}

class ConfigError extends Error {
  constructor(message: string, public readonly field: keyof IConfig) {
    super(message);
    this.name = 'ConfigError';
  }

  public static requiredError(field: keyof IConfig): ConfigError {
    return new ConfigError(`Field '${field}' is required`, field);
  }
}

export class Config implements IConfig {
  constructor(
    public readonly token: string,
    public readonly logLevel = 'info',
    public readonly materialsPath = __dirname + '/../data',
    public readonly mongoUrl = 'mongodb://localhost:27017',
    public readonly chartServiceUrl = 'http://127.0.0.1:5301/bar',
    public readonly localesPath = __dirname + '/../locales',
    public readonly colors: IColorConfig
  ) {
    this.token = token;
    this.mongoUrl = mongoUrl;
    this.materialsPath = materialsPath;
    this.logLevel = logLevel;
    this.chartServiceUrl = chartServiceUrl;
  }

  public static fromJsonFile(
    path: string,
    defaults: Partial<IConfig> = {}
  ): Config {
    const defaultsErrors = Config.validate(defaults);
    const defaultsAreSufficient = defaultsErrors.length === 0;

    if (!fs.existsSync(path) && !defaultsAreSufficient) {
      throw new Error(
        `Config file not found at ${path} and insufficient defaults provided: ${defaultsErrors.join(
          ', '
        )}`
      );
    }

    let fileConfig;

    try {
      fileConfig = JSON.parse(fs.readFileSync(path, 'utf8'));
    } catch (e) {
      if (!defaultsAreSufficient) {
        throw new Error(
          `Config file at ${path} could not be parsed and insufficient defaults provided: ${defaultsErrors.join(
            ', '
          )}`
        );
      }
    }

    const config = {
      ...defaults,
      ...fileConfig,
    };
    const errors = Config.validate(config);

    if (errors.length > 0) {
      throw new Error(`Invalid config file at ${path}: ${errors.join(', ')}`);
    }

    return new Config(
      config.token,
      config.logLevel,
      config.materialsPath,
      config.mongoUrl,
      config.chartServiceUrl,
      config.localesPath,
      config.colors ?? {
        primary: '#F3B6AF',
        secondary: '#ECD1A0',
        success: '#369e42',
        error: '#e03838',
        warning: '#edb63e',
        info: '#578bf2',
      }
    );
  }

  public static validate(config: Partial<IConfig>): ConfigError[] {
    const errors: ConfigError[] = [];

    if (!config.token) errors.push(ConfigError.requiredError('token'));

    if (config.colors) {
      if (typeof config.colors !== 'object')
        errors.push(new ConfigError('colors must be an object', 'colors'));

      const requiredColors = [
        'primary',
        'secondary',
        'success',
        'error',
        'warning',
        'info',
      ];

      const missingColors = requiredColors.filter(
        color => color in config.colors! === false
      );

      if (missingColors.length > 0)
        errors.push(
          new ConfigError(
            `colors is missing the following colors: ${missingColors.join(
              ', '
            )}`,
            'colors'
          )
        );

      const invalidColors = Object.entries(config.colors!).filter(
        ([, color]) => !/^#[0-9a-f]{6}$/i.test(color)
      );

      if (invalidColors.length > 0)
        errors.push(
          new ConfigError(
            `colors contains invalid colors: ${invalidColors
              .map(([color]) => color)
              .join(', ')}`,
            'colors'
          )
        );
    }
    return errors;
  }
}
