import {injectable, inject} from 'inversify';
import {IChartService, ILoggerService} from '../interfaces';
import {IConfig} from '../../config';
import {Stream} from 'stream';
import {request} from 'http';

@injectable()
export default class ChartService implements IChartService {
  private readonly _url: URL;
  private readonly _logger: ILoggerService;

  constructor(
    @inject('Config') config: IConfig,
    @inject('LoggerService') logger: ILoggerService
  ) {
    this._url = new URL(config.chartServiceUrl);
    this._logger = logger;

    this._logger.log(`Chart service URL: ${this._url}`);
  }

  public getChartPng(
    title: string,
    xlabel: string,
    ylabel: string,
    xdata: number[],
    ydata: number[],
    grid: boolean,
    color: string
  ): Promise<Stream> {
    const body = JSON.stringify({
      title,
      xlabel,
      ylabel,
      xdata,
      ydata,
      grid,
      color,
    });

    return new Promise<Stream>((resolve, reject) => {
      const req = request(
        {
          hostname: this._url.hostname,
          port: this._url.port,
          path: this._url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': body.length,
          },
        },
        res => {
          if (res.headers['content-type'] !== 'image/png') {
            reject(
              new Error(`Chart service returned ${res.headers['content-type']}`)
            );
          }

          if (res.statusCode !== 200) {
            reject(new Error(`Chart service returned ${res.statusCode}`));
          }

          resolve(res);
        }
      );

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  public getDateBarChartPng(
    data: {
      x: string;
      y: number;
    }[],
    color: string,
    buckets: number,
    horizontal = -1,
    horizontalColor = 'r'
  ): Promise<Stream> {
    const body = JSON.stringify({
      data,
      color,
      buckets,
      horizontal,
      horizontal_color: horizontalColor,
    });

    return new Promise<Stream>((resolve, reject) => {
      const req = request(
        {
          hostname: this._url.hostname,
          port: this._url.port,
          path: '/easyDateBar',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': body.length,
          },
        },
        res => {
          if (res.headers['content-type'] !== 'image/png') {
            reject(
              new Error(`Chart service returned ${res.headers['content-type']}`)
            );
          }

          if (res.statusCode !== 200) {
            reject(new Error(`Chart service returned ${res.statusCode}`));
          }

          resolve(res);
        }
      );

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}
