import * as fs from 'fs';

export interface IConfig {
  token: string;
  mongoUrl: string;
  autocompletionDataFile: string;
}

class ConfigError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = 'ConfigError';
  }

  public static requiredError(field: string): ConfigError {
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

  public static fromJsonFile(path: string): Config {
    if (!fs.existsSync(path)) {
      throw new Error(`Config file not found at ${path}`);
    }

    const config = JSON.parse(fs.readFileSync(path, 'utf8'));
    const errors = Config.validate(config);

    if (errors.length > 0) {
      throw new Error(`Invalid config file at ${path}: ${errors.join(', ')}`);
    }

    return new Config(
      config.token,
      config.mongoUrl,
      config.autocompletionDataFile
    );
  }

  public static validate(config: Partial<IConfig>): ConfigError[] {
    const errors: ConfigError[] = [];

    if (!config.token) errors.push(ConfigError.requiredError('token'));
    if (!config.autocompletionDataFile)
      errors.push(ConfigError.requiredError('autocompletionDataFile'));

    return [];
  }
}
