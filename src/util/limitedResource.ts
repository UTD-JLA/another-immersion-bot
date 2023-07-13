export type ReleaseFn = () => void;

export class LimitedResourceLock {
  constructor(private readonly _max: number) {}

  private readonly _queue: (() => void)[] = [];
  private _count = 0;

  public async acquire(timeout?: number): Promise<ReleaseFn> {
    if (this._count < this._max) {
      this._count++;
      return () => {
        this._count--;
        this._next();
      };
    }

    return new Promise((resolve, reject) => {
      let isDeadEntry = false;

      const timeoutId = timeout
        ? setTimeout(() => {
            isDeadEntry = true;
            reject(new Error('Timeout acquiring lock'));
          }, timeout)
        : undefined;

      this._queue.push(() => {
        if (isDeadEntry) {
          return;
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        resolve(this.acquire(timeout));
      });
    });
  }

  private _next() {
    const next = this._queue.shift();
    if (next) {
      next();
    }
  }
}
