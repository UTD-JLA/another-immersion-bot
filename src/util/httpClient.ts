import {request as requestHttps} from 'https';
import {request as requestHttp} from 'http';
import {
  IncomingMessage,
  OutgoingHttpHeader,
  OutgoingHttpHeaders,
  RequestOptions,
} from 'http';
import Stream from 'stream';
import {VERSION} from './version';
import {platform, release} from 'os';
import {z} from 'zod';
import {formatString} from './formatString';

export type RequestOptionsAndBody = RequestOptions & {
  body?: string | Buffer | Stream;
};

// Wrapper around http(s) response for convenience
export class HttpResponse {
  private _response: IncomingMessage;

  constructor(response: IncomingMessage) {
    this._response = response;
  }

  get headers(): IncomingMessage['headers'] {
    return this._response.headers;
  }

  get statusCode(): IncomingMessage['statusCode'] {
    return this._response.statusCode;
  }

  get statusMessage(): IncomingMessage['statusMessage'] {
    return this._response.statusMessage;
  }

  raw(): Stream.Readable {
    return this._response;
  }

  text(): Promise<string> {
    return new Promise((resolve, reject) => {
      let data = '';
      this._response.on('data', chunk => (data += chunk));
      this._response.on('end', () => resolve(data));
      this._response.on('error', reject);
    });
  }

  json(): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let data = '';
      this._response.on('data', chunk => (data += chunk));
      this._response.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
      this._response.on('error', reject);
    });
  }

  async jsonAs<T>(schema: z.ZodType<T>): Promise<T> {
    const data = await this.json();
    return schema.parse(data);
  }
}

export class HttpClient {
  private _headers: OutgoingHttpHeaders;
  private _timeout: number;

  constructor() {
    // default timeout is 5 seconds
    this._timeout = 5000;
    this._headers = {
      // default user agent
      'User-Agent':
        `Mozilla/5.0 (${platform()} ${release()}; Node ${process.version})` +
        ' +https://github.com/UTD-JLA/another-immersion-bot;' +
        ` ImmersionBot/${VERSION}`,
    };
  }

  withTimeout(timeout: number): HttpClient {
    this._timeout = timeout;
    return this;
  }

  withHeader(key: string, value: OutgoingHttpHeader): HttpClient {
    this._headers[key] = value;
    return this;
  }

  withUserAgent(userAgent: string, format = true): HttpClient {
    if (!format) {
      this._headers['User-Agent'] = userAgent;
      return this;
    }

    this._headers['User-Agent'] = formatString(userAgent, {
      platform: platform(),
      release: release(),
      nodeVersion: process.version,
      version: VERSION,
    });
    return this;
  }

  async request(
    url: string | URL,
    options?: RequestOptionsAndBody
  ): Promise<HttpResponse> {
    if (options) {
      options.headers = {...this._headers, ...options.headers};
    }

    let request: typeof requestHttp;

    if (typeof url === 'string') {
      if (url.startsWith('https://')) {
        request = requestHttps;
      } else if (url.startsWith('http://')) {
        request = requestHttp;
      } else {
        throw new Error('Invalid URL');
      }
    } else {
      if (url.protocol === 'https:') {
        request = requestHttps;
      } else if (url.protocol === 'http:') {
        request = requestHttp;
      } else {
        throw new Error('Invalid URL');
      }
    }

    return new Promise((resolve, reject) => {
      const req = request(
        url,
        {
          headers: this._headers,
          timeout: this._timeout,
          ...options,
        },
        res => {
          if (res.statusCode !== 200) {
            reject(
              new Error(`Request failed with status code ${res.statusCode}`)
            );
          } else {
            resolve(new HttpResponse(res));
          }
        }
      );

      req.on('error', reject);

      if (options?.body) {
        if (typeof options.body === 'string') {
          req.write(options.body);
          req.end();
        } else if (Buffer.isBuffer(options.body)) {
          req.write(options.body);
          req.end();
        } else {
          // body is a stream
          options.body.pipe(req);
        }
      } else {
        req.end();
      }
    });
  }

  get(url: string | URL, options?: RequestOptions): Promise<HttpResponse> {
    return this.request(url, {...options, method: 'GET'});
  }

  post(
    url: string | URL,
    body: string | Buffer | Stream,
    options?: RequestOptions
  ): Promise<HttpResponse> {
    return this.request(url, {
      ...options,
      method: 'POST',
      body,
    });
  }
}
