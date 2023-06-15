import * as fs from 'fs';

export interface IConfig {
  token: string;
  mongoUrl: string;
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
    public readonly mongoUrl = 'mongodb://localhost:27017'
  ) {
    this.token = token;
    this.mongoUrl = mongoUrl;
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

    return new Config(config.token, config.mongoUrl);
  }

  public static validate(config: IConfig): ConfigError[] {
    const errors: ConfigError[] = [];

    if (!config.token) errors.push(ConfigError.requiredError('token'));

    return [];
  }
}
