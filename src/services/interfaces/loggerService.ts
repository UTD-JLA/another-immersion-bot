export interface ILoggerService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log(message: string, meta?: any): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error(message: string, meta?: any): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn(message: string, meta?: any): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  child(meta: any): ILoggerService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug(message: string, meta?: any): void;
}
