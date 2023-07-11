import {inject, injectable} from 'inversify';
import {
  IUserSpeedService,
  IActivityService,
  ILoggerService,
} from '../interfaces';
import {ActivityUnit} from '../../models/activity';
import {PrefixedCache, PrefixedExpiringCache} from '../../util/cache';

type TimeAndSpeed = [Date, number];

type ConversionFunction = (value: number) => number;

@injectable()
export default class UserSpeedService implements IUserSpeedService {
  // Cache for 6 hours
  private static readonly CACHE_TTL = 6 * 60 * 60 * 1000;

  // Clear cache for user every 5 changes even if TTL hasn't expired
  private static readonly CLEAR_EVERY_N_CHANGES = 5;

  private readonly _speedCache: PrefixedCache<number> =
    new PrefixedExpiringCache(UserSpeedService.CACHE_TTL);

  private readonly _convertCache: PrefixedCache<ConversionFunction> =
    new PrefixedExpiringCache(UserSpeedService.CACHE_TTL);

  private readonly _changes: Map<string, number> = new Map();

  constructor(
    @inject('ActivityService')
    private readonly _activityService: IActivityService,
    @inject('LoggerService')
    private readonly _loggerService: ILoggerService
  ) {
    this._activityService.on('activityCreated', activity => {
      if (!activity.speed)
        return this._loggerService.debug(
          `Activity ${activity._id} has no speed, skipping`
        );

      const userId = activity.userId;
      this._changes.set(userId, (this._changes.get(userId) ?? 0) + 1);
      if (
        this._changes.get(userId)! >= UserSpeedService.CLEAR_EVERY_N_CHANGES
      ) {
        this._loggerService.debug(
          `Clearing cache for user ${userId} after ${this._changes.get(
            userId
          )} changes`
        );
        this._changes.set(userId, 0);
        this._speedCache.deletePrefix(userId);
        this._convertCache.deletePrefix(userId);
      }
    });
  }

  public async predictSpeed(
    userId: string,
    type: ActivityUnit
  ): Promise<number> {
    const cacheKey = `${userId}-${type}`;
    const entry = this._speedCache.get(cacheKey);

    if (typeof entry !== 'undefined') {
      this._loggerService.debug(
        `Cache hit for speed prediction for user ${userId} and type ${type}`
      );
      return entry;
    }

    const readingSpeeds = await this._activityService.getSpeedsInDateRange(
      userId,
      // 21 days ago
      new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
      new Date(),
      type
    );

    this._loggerService.debug(
      `Cache miss for speed prediction for user ${userId} and type ${type}`
    );

    this._loggerService.debug(
      `Got ${readingSpeeds.length} reading speeds for user ${userId} and type ${type}`,
      {readingSpeeds}
    );

    // if no activity in the last 21 days then return 0
    if (readingSpeeds.length === 0) {
      return 0;
    }

    const predictedSpeed = Math.max(
      this._predictCurrentReadingSpeed(readingSpeeds),
      0
    );

    this._loggerService.debug(
      `Predicted speed for user ${userId} and type ${type}: ${predictedSpeed}`,
      {cacheKey}
    );

    this._speedCache.set(cacheKey, predictedSpeed);
    return predictedSpeed;
  }

  public async convertUnit(
    userId: string,
    from: ActivityUnit,
    to: ActivityUnit,
    value: number
  ): Promise<number> {
    if (from === to) {
      return value;
    }

    const cacheKey = `${userId}-${from}-${to}`;
    const entry = this._convertCache.get(cacheKey);

    if (typeof entry !== 'undefined') {
      return entry(value);
    }

    const [fromSpeeds, toSpeeds] = await Promise.all([
      this.predictSpeed(userId, from),
      this.predictSpeed(userId, to),
    ]);

    if (fromSpeeds === 0 || toSpeeds === 0) {
      return 0;
    }

    const f = this._createSpeedUnitConversion(toSpeeds, fromSpeeds);
    this._convertCache.set(cacheKey, f);
    return f(value);
  }

  private _getBestFitLine(x: number[], y: number[]): [number, number] {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);
    const sumXX = x.reduce((a, b) => a + b * b, 0);
    const m = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const b = (sumY - m * sumX) / n;
    return [m, b];
  }

  private _filterOutliers(
    x: number[],
    y: number[],
    threshold: number
  ): [number[], number[]] {
    if (x.length !== y.length) {
      throw new Error('x and y must be the same length');
    }

    const n = x.length;

    if (n <= 2) {
      return [x, y];
    }

    const [m, b] = this._getBestFitLine(x, y);
    const yHat = x.map(x => m * x + b);
    const residuals = y.map((y, i) => y - yHat[i]);
    const std = Math.sqrt(residuals.reduce((a, b) => a + b * b, 0) / (n - 2));
    const filteredX: number[] = [];
    const filteredY: number[] = [];

    for (let i = 0; i < n; i++) {
      this._loggerService.debug(
        `Residual for point ${i}: ${residuals[i]}, std: ${std}, threshold: ${threshold}`
      );

      if (Math.abs(residuals[i]) <= threshold * std) {
        filteredX.push(x[i]);
        filteredY.push(y[i]);
      }
    }

    return [filteredX, filteredY];
  }

  /**
   * Predicts the user's current reading speed based on their past reading speeds.
   * @param speeds The user's past reading speeds
   * @param now The current time
   * @returns The user's current reading speed
   */
  private _predictCurrentReadingSpeed(
    speeds: TimeAndSpeed[],
    now: Date = new Date()
  ): number {
    if (speeds.length === 0) {
      return 0;
    }

    if (speeds.length === 1) {
      return speeds[0][1];
    }

    const epoch = speeds[0][0].getTime();
    const [t, y] = speeds.reduce(
      ([t, y], [time, speed]) => {
        t.push(time.getTime() - epoch);
        y.push(speed);
        return [t, y];
      },
      [[], []] as [number[], number[]]
    );

    const [filteredT, filteredY] = this._filterOutliers(t, y, 1.0);

    this._loggerService.debug(
      `Filtered out ${t.length - filteredT.length} outliers`
    );

    const [m, b] = this._getBestFitLine(filteredT, filteredY);

    this._loggerService.debug(
      `Best fit line for ${speeds.length} data points: y = ${m}x + ${b}`
    );

    if (isNaN(m) || isNaN(b)) {
      this._loggerService.warn(
        `Best fit line for ${speeds.length} data points is NaN`
      );
      return 0;
    }

    return m * (now.getTime() - epoch) + b;
  }

  /**
   * Returns function that converts from unit Y to unit X
   * based on the speed of both units from the user's perspective.
   * For example, provided char/min and page/min, get a function
   * which evaluates to `(numPages: number) => (char/page)*numPages`
   * @param speedsX The user's reading speed for unit X
   * @param speedsY The user's reading speed for unit Y
   * @returns A function that converts from unit Y to unit X
   */
  private _createSpeedUnitConversion(
    predictedXSpeed: number,
    predictedYSpeed: number
  ): ConversionFunction {
    // Example: this would be (char/min) / (page/min) * page = # char
    return (n: number) => (predictedXSpeed / predictedYSpeed) * n;
  }
}
