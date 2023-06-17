import * as fs from 'fs';

export interface IConfig {
  token: string;
  mongoUrl: string;
  autocompletionDataFile: string;
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
    public readonly mongoUrl = 'mongodb://localhost:27017',
    public readonly autocompletionDataFile: string
  ) {
    this.token = token;
    this.mongoUrl = mongoUrl;
    this.autocompletionDataFile = autocompletionDataFile;
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

    const config = {
      ...defaults,
      ...JSON.parse(fs.readFileSync(path, 'utf8')),
    };
    const errors = Config.validate(config);

    if (errors.length > 0) {
      throw new Error(`Invalid config file at ${path}: ${errors.join(', ')}`);
    }

    return new Config(
      config.token ?? defaults.token,
      config.mongoUrl ?? defaults.mongoUrl,
      config.autocompletionDataFile ?? defaults.autocompletionDataFile
    );
  }

  public static validate(config: Partial<IConfig>): ConfigError[] {
    const errors: ConfigError[] = [];

    if (!config.token) errors.push(ConfigError.requiredError('token'));
    if (!config.autocompletionDataFile)
      errors.push(ConfigError.requiredError('autocompletionDataFile'));
    else if (!fs.existsSync(config.autocompletionDataFile)) {
      errors.push(
        new ConfigError(
          `File '${config.autocompletionDataFile}' does not exist`,
          'autocompletionDataFile'
        )
      );
    }

    return errors;
  }
}
