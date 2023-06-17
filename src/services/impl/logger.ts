import {Logger, transports, format, createLogger} from 'winston';
import {ILoggerService} from '../interfaces';
import {injectable, inject} from 'inversify';
import {IConfig} from '../../config';

@injectable()
export default class LoggerService implements ILoggerService {
  private readonly _config: IConfig;
  private readonly _logger: Logger;

  constructor(@inject('Config') config: IConfig, meta?: any) {
    this._config = config;
    this._logger = createLogger({
      level: this._config.logLevel,
      format: format.combine(format.timestamp(), format.json()),
      defaultMeta: meta,
      transports: [new transports.Console()],
    });
  }

  public child(meta: any): ILoggerService {
    return new LoggerService(this._config, meta);
  }

  public log(message: string, meta?: any): void {
    this._logger.info(message, meta);
  }

  public error(message: string, meta?: any): void {
    this._logger.error(message, meta);
  }

  public warn(message: string, meta?: any): void {
    this._logger.warn(message, meta);
  }
}
