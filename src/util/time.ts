import {IGuildConfigService, IUserConfigService} from '../services';
import moment from 'moment-timezone';

export function getTimezones() {
  return moment.tz.names();
}

// Returns the UTC offset in minutes
export function getUTCOffset(timezone: string): number {
  return moment.tz(timezone).utcOffset();
}

export async function getUserTimezone(
  userService: IUserConfigService,
  guildService: IGuildConfigService,
  userId: string,
  guildId?: string | null,
  defaultTz = 'UTC'
): Promise<string> {
  const [userTz, guildConfig] = await Promise.all([
    userService.getTimezone(userId),
    guildId ? guildService.getGuildConfig(guildId) : Promise.resolve(undefined),
  ]);

  return userTz ?? guildConfig?.timezone ?? defaultTz;
}

export function getMonthsInRangeByTimezone(
  start: Date,
  end: Date,
  timezone: string
): string[] {
  const months = [];
  const startMoment = moment.tz(start, timezone);
  const endMoment = moment.tz(end, timezone);

  while (startMoment.isSameOrBefore(endMoment)) {
    months.push(startMoment.format('YYYY-MM'));
    startMoment.add(1, 'month');
  }

  return months;
}

export function getDaysInRangeByTimezone(
  start: Date,
  end: Date,
  timezone: string
): string[] {
  const days = [];
  const startMoment = moment.tz(start, timezone);
  const endMoment = moment.tz(end, timezone);

  console.log(startMoment.format(), endMoment.format());

  while (startMoment.isSameOrBefore(endMoment)) {
    days.push(startMoment.format('YYYY-MM-DD'));
    startMoment.add(1, 'day');
  }

  return days;
}

export async function parseTimeWithUserTimezone(
  userService: IUserConfigService,
  guildService: IGuildConfigService,
  time: string,
  userId: string,
  guildId?: string | null,
  defaultTz = 'UTC'
): Promise<Date | null> {
  const tz = await getUserTimezone(
    userService,
    guildService,
    userId,
    guildId,
    defaultTz
  );

  const date = moment.tz(time, 'YYYY-MM-DD HH:mm', tz);
  return date.isValid() ? date.toDate() : null;
}

export function calculateDelta(first: Date, second: Date): number {
  return Math.abs(first.getTime() - second.getTime());
}

export function calculateDeltaInDays(first: Date, second: Date): number {
  const delta = calculateDelta(first, second);
  return delta / (1000 * 60 * 60 * 24);
}
