import {IGuildConfig} from '../../models/guildConfig';

export interface IGuildConfigService {
  getGuildConfig(guildId: string): Promise<IGuildConfig>;
  updateGuildConfig(
    guildId: string,
    config: Partial<IGuildConfig>
  ): Promise<void>;
}
