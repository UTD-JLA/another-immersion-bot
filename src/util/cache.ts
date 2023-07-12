export interface Cache<T> {
  get(key: string): T | undefined;
  has(key: string): boolean;
  set(key: string, value: T): void;
  delete(key: string): void;
}

export interface PrefixedCache<T> extends Cache<T> {
  deletePrefix(prefix: string): void;
}

export class ExpiringCache<T> implements Cache<T> {
  protected readonly _cache: Map<
    string,
    {
      value: T;
      timeout: NodeJS.Timeout;
    }
  >;
  private readonly _ttl: number;
  private readonly _resetOnAccess: boolean;

  constructor(ttl: number, resetOnAccess = false) {
    this._cache = new Map();
    this._ttl = ttl;
    this._resetOnAccess = resetOnAccess;
  }

  public get(key: string): T | undefined {
    if (!this._resetOnAccess) {
      return this._cache.get(key)?.value;
    }

    const entry = this._cache.get(key);
    if (typeof entry === 'undefined') {
      return undefined;
    }

    clearTimeout(entry.timeout);
    entry.timeout = setTimeout(() => {
      this._cache.delete(key);
    }, this._ttl);

    return entry.value;
  }

  public has(key: string): boolean {
    return this._cache.has(key);
  }

  public set(key: string, value: T): void {
    if (this._cache.has(key)) {
      const entry = this._cache.get(key)!;
      clearTimeout(entry.timeout);
      entry.timeout = setTimeout(() => {
        this._cache.delete(key);
      }, this._ttl);
    } else {
      const timeout = setTimeout(() => {
        this._cache.delete(key);
      }, this._ttl);
      this._cache.set(key, {value, timeout});
    }
  }

  public delete(key: string): void {
    const entry = this._cache.get(key);
    if (entry) {
      clearTimeout(entry.timeout);
      this._cache.delete(key);
    }
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
