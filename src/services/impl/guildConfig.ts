import {IGuildConfigService} from '../interfaces';
import {IGuildConfig} from '../../models/guildConfig';
import {GuildConfig} from '../../db/mongoose';
import {injectable} from 'inversify';

@injectable()
export default class GuildConfigService implements IGuildConfigService {
  private readonly _cache: Map<string, IGuildConfig> = new Map();

  public async getGuildConfig(guildId: string): Promise<IGuildConfig> {
    if (this._cache.has(guildId)) {
      return this._cache.get(guildId)!;
    }

    const config = await GuildConfig.findOne({guildId}).exec();
    if (config) {
      this._cache.set(guildId, config.toObject());
      return config.toObject();
    }

    const newConfig = await GuildConfig.create({guildId});
    this._cache.set(guildId, newConfig.toObject());
    return newConfig.toObject();
  }

  public async updateGuildConfig(
    guildId: string,
    config: Partial<IGuildConfig>
  ): Promise<void> {
    const existingConfig = await this.getGuildConfig(guildId);

    // validate new config
    await new GuildConfig({...existingConfig, ...config}).validate();

    await GuildConfig.updateOne(
      {_id: existingConfig.id},
      {
        $set: config,
      }
    ).exec();

    if (this._cache.has(guildId)) {
      const cachedConfig = this._cache.get(guildId)!;
      this._cache.set(guildId, {...cachedConfig, ...config});
    }
  }
}
