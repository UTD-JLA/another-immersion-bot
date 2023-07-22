import {IGuildConfigService} from '../interfaces';
import {IGuildConfig} from '../../models/guildConfig';
import {injectable} from 'inversify';
import {guildConfigs} from '../../db/drizzle/schema/guildConfigs';
import {getDb} from '../../db/drizzle';
import {eq} from 'drizzle-orm';

@injectable()
export default class SqliteGuildConfigService implements IGuildConfigService {
  public getGuildConfig(guildId: string): Promise<IGuildConfig> {
    const guildConfig = getDb()
      .select()
      .from(guildConfigs)
      .where(eq(guildConfigs.guildId, guildId))
      .get();

    return Promise.resolve({
      guildId: guildConfig?.guildId,
      id: guildConfig?.guildId,
      timezone: guildConfig?.timeZone ?? undefined,
    });
  }

  public updateGuildConfig(
    guildId: string,
    config: Partial<IGuildConfig>
  ): Promise<void> {
    getDb()
      .insert(guildConfigs)
      .values({
        guildId,
        timeZone: config.timezone,
      })
      .onConflictDoUpdate({
        target: guildConfigs.guildId,
        set: {
          timeZone: config.timezone,
        },
      })
      .run();

    return Promise.resolve();
  }
}
