import {inject, injectable} from 'inversify';
import {
  IUserSpeedService,
  IActivityService,
  ILoggerService,
} from '../interfaces';
import {ActivityUnit} from '../../models/activity';
import {IConfig} from '../../config';
import {Cache, PrefixedCache, PrefixedExpiringCache} from '../../util/cache';

@injectable()
export default class UserSpeedService implements IUserSpeedService {
  // Cache for 6 hours
  private static readonly DEFAULT_CACHE_TTL = 6 * 60 * 60 * 1000;
  // Clear cache for user every 5 changes even if TTL hasn't expired
  private static readonly DEFAULT_CLEAR_EVERY_N_CHANGES = 5;
  // number of days to look back for speed calculation
  private static readonly DEFAULT_N_DAYS = 21;
  // lowest possible weight, weight values are between 0 and 1
  // in this case reading speed from 21 days ago will matter 10% less
  // than a reading speed just logged
  private static readonly DEFAULT_LOWEST_WEIGHT = 0.9;

  private readonly _changes: Cache<number> = new Map();
  private readonly _speedCache: PrefixedCache<number>;

  constructor(
    @inject('ActivityService')
    private readonly _activityService: IActivityService,
    @inject('LoggerService')
    private readonly _loggerService: ILoggerService,
    @inject('Config')
    private readonly _config: IConfig
  ) {
    this._speedCache = new PrefixedExpiringCache(
      _config.speedCacheTtl || UserSpeedService.DEFAULT_CACHE_TTL
    );

    this._activityService.on('activityCreated', activity => {
      if (!activity.speed)
        return this._loggerService.debug(
          `Activity ${activity._id} has no speed, skipping`
        );

      const userId = activity.userId;
      this._changes.set(userId, (this._changes.get(userId) ?? 0) + 1);
      if (
        this._changes.get(userId)! >=
        (_config.speedCacheClearEvery ||
          UserSpeedService.DEFAULT_CLEAR_EVERY_N_CHANGES)
      ) {
        this._loggerService.debug(
          `Clearing cache for user ${userId} after ${this._changes.get(
            userId
          )} changes`
        );
        this._changes.set(userId, 0);
        this._speedCache.deletePrefix(userId);
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
      new Date(
        Date.now() -
          (this._config.speedLookbackDays || UserSpeedService.DEFAULT_N_DAYS) *
            24 *
            60 *
            60 *
            1000
      ),
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
      this._speedCache.set(cacheKey, 0);
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

    const [fromSpeeds, toSpeeds] = await Promise.all([
      this.predictSpeed(userId, from),
      this.predictSpeed(userId, to),
    ]);

    if (fromSpeeds === 0 || toSpeeds === 0) {
      return 0;
    }

    const f = this._createSpeedUnitConversion(toSpeeds, fromSpeeds);
    return f(value);
  }

  /**
   * Predicts the user's current reading speed based on their past reading speeds.
   * @param speeds The user's past reading speeds
   * @param now The current time
   * @returns The user's current reading speed, 0 and NaN are possible values
   */
  private _predictCurrentReadingSpeed(
    speeds: [Date, number][],
    now: Date = new Date()
  ): number {
    const dateInDaysEpoch = (d: Date) => d.getTime() / (24 * 60 * 60 * 1000);

    // number of days included in the prediction
    const D = this._config.speedLookbackDays || UserSpeedService.DEFAULT_N_DAYS;
    // smallest weight to give to a reading speed
    const L =
      this._config.speedLowestWeight || UserSpeedService.DEFAULT_LOWEST_WEIGHT;
    // current time in days
    const N = dateInDaysEpoch(now);
    // weight function
    // this function is linear and goes from 1 to L (0<=L<=1)
    // as the reading speed gets older
    const w = (t: number) => ((t - N) * (1 - L)) / D + 1;

    const weights = speeds.map(([time]) => dateInDaysEpoch(time)).map(w);
    const sumWeights = weights.reduce((a, b) => a + b, 0);
    const weightedSpeeds = speeds.map(([, speed], i) => weights[i] * speed);

    const mean = weightedSpeeds.reduce((a, b) => a + b, 0) / sumWeights;

    const std = Math.sqrt(
      weightedSpeeds
        .map(speed => Math.pow(speed - mean, 2))
        .reduce((a, b) => a + b, 0) / sumWeights
    );

    const z = 1.96; // 95% confidence interval
    const lowerBound = mean - z * std;
    const upperBound = mean + z * std;

    if (lowerBound === upperBound) {
      return lowerBound;
    }

    const filteredSpeeds = weightedSpeeds.filter(
      speed => speed >= lowerBound && speed <= upperBound
    );

    const filteredWeights = weights.filter(
      (_, i) =>
        weightedSpeeds[i] >= lowerBound && weightedSpeeds[i] <= upperBound
    );

    const filteredSumWeights = filteredWeights.reduce((a, b) => a + b, 0);
    const filteredMean =
      filteredSpeeds.reduce((a, b) => a + b, 0) / filteredSumWeights;

    return filteredMean;
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
  ): (value: number) => number {
    // Example: this would be (char/min) / (page/min) * page = # char
    return (n: number) => (predictedXSpeed / predictedYSpeed) * n;
  }
}
