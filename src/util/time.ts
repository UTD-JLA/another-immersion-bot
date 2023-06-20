import {IGuildConfigService, IUserConfigService} from '../services';
import {parseDate} from 'chrono-node';

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

  return parseDate(time, {timezone: tz});
}

export function calculateDelta(first: Date, second: Date): number {
  return Math.abs(first.getTime() - second.getTime());
}

export function calculateDeltaInDays(first: Date, second: Date): number {
  const delta = calculateDelta(first, second);
  return Math.floor(delta / (1000 * 60 * 60 * 24));
}
