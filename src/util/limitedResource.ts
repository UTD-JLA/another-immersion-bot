export class LimitedResourceLock {
  constructor(private readonly _max: number) {}

  private readonly _queue: (() => void)[] = [];
  private _count = 0;

  public async acquire(timeout?: number): Promise<void> {
    if (this._count < this._max) {
      this._count++;
      return;
    }

    await new Promise<void>((resolve, reject) => {
      if (timeout === undefined) {
        this._queue.push(resolve);
        return;
      }

      const timeoutId = setTimeout(() => {
        reject(new Error('Timed out'));
      }, timeout);

      this._queue.push(() => {
        clearTimeout(timeoutId);
        resolve();
      });
    });
  }

  public release(): void {
    if (this._queue.length > 0) {
      this._queue.shift()!();
    } else {
      this._count--;
    }
  }
}
