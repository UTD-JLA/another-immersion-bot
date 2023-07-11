export interface Cache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): void;
}

export interface PrefixedCache<T> extends Cache<T> {
  deletePrefix(prefix: string): void;
}

export class ExpiringCache<T> {
  protected readonly _cache: Map<string, T>;
  protected readonly _timeouts: Map<string, NodeJS.Timeout>;
  private readonly _ttl: number;

  constructor(ttl: number) {
    this._cache = new Map();
    this._timeouts = new Map();
    this._ttl = ttl;
  }

  public get(key: string): T | undefined {
    return this._cache.get(key);
  }

  public set(key: string, value: T): void {
    if (this._timeouts.has(key)) {
      clearTimeout(this._timeouts.get(key)!);
      this._timeouts.delete(key);
    }

    this._cache.set(key, value);
    this._timeouts.set(
      key,
      setTimeout(() => {
        this._cache.delete(key);
        this._timeouts.delete(key);
      }, this._ttl)
    );
  }

  public delete(key: string): void {
    if (this._timeouts.has(key)) {
      clearTimeout(this._timeouts.get(key)!);
      this._timeouts.delete(key);
    }

    this._cache.delete(key);
  }
}

export class PrefixedExpiringCache<T>
  extends ExpiringCache<T>
  implements PrefixedCache<T>
{
  public deletePrefix(prefix: string): void {
    for (const key of this._cache.keys()) {
      if (key.startsWith(prefix)) {
        this.delete(key);
      }
    }
  }
}
