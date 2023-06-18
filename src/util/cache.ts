export class ExpiringCache<T> {
  private readonly _cache: Map<string, T>;
  private readonly _timeouts: Map<string, NodeJS.Timeout>;
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
}
