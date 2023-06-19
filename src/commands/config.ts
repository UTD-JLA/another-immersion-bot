import {ICommand} from '.';
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  PermissionFlagsBits,
} from 'discord.js';
import {IGuildConfigService} from '../services';
import {IGuildConfig} from '../models/guildConfig';
import {injectable, inject} from 'inversify';

@injectable()
export default class ConfigCommand implements ICommand {
  constructor(
    @inject('GuildConfigService')
    private readonly _guildConfigService: IGuildConfigService
  ) {}

  public readonly data = <SlashCommandBuilder>new SlashCommandBuilder()
    .setName('config')
    .setDescription('Config command')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('Set config value')
        .addStringOption(option =>
          option
            .setName('timezone')
            .setDescription('Set timezone')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand.setName('get').setDescription('Get current config')
    );

  private async _executeSet(interaction: ChatInputCommandInteraction) {
    const timezone = interaction.options.getString('timezone', false);
    const newConfig: Partial<IGuildConfig> = {};

    if (timezone) {
      newConfig.timezone = timezone;
    }

    if (Object.keys(newConfig).length === 0) {
      await interaction.reply('No config values provided');
      return;
    }

    await this._guildConfigService.updateGuildConfig(
      interaction.guildId!,
      newConfig
    );

    await interaction.reply('Config updated');
  }

  private async _executeGet(interaction: ChatInputCommandInteraction) {
    const config = await this._guildConfigService.getGuildConfig(
      interaction.guildId!
    );

    await interaction.reply(
      `Config:\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``
    );
  }

  public async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'set':
        await this._executeSet(interaction);
        break;
      case 'get':
        await this._executeGet(interaction);
        break;
    }
  }

  public autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}
