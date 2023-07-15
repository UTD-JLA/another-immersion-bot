import {ICommand} from '.';
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from 'discord.js';
import {IGuildConfigService, ILocalizationService} from '../services';
import {IGuildConfig} from '../models/guildConfig';
import {injectable, inject} from 'inversify';

@injectable()
export default class ConfigCommand implements ICommand {
  constructor(
    @inject('GuildConfigService')
    private readonly _guildConfigService: IGuildConfigService,
    @inject('LocalizationService')
    private readonly _localizationService: ILocalizationService
  ) {}

  public get data() {
    return new SlashCommandBuilder()
      .setName('config')
      .setNameLocalizations(
        this._localizationService.getAllLocalizations('config.name')
      )
      .setDescription('GUILD config command, only available for admins')
      .setDescriptionLocalizations(
        this._localizationService.getAllLocalizations('config.description')
      )
      .setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand(subcommand =>
        subcommand
          .setName('set')
          .setNameLocalizations(
            this._localizationService.getAllLocalizations('config.set.name')
          )
          .setDescription('Set config value')
          .setDescriptionLocalizations(
            this._localizationService.getAllLocalizations(
              'config.set.description'
            )
          )
          .addStringOption(option =>
            option
              .setName('timezone')
              .setNameLocalizations(
                this._localizationService.getAllLocalizations(
                  'config.set.timezone.name'
                )
              )
              .setDescription('Set timezone')
              .setDescriptionLocalizations(
                this._localizationService.getAllLocalizations(
                  'config.set.timezone.description'
                )
              )
              .setRequired(false)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('get')
          .setNameLocalizations(
            this._localizationService.getAllLocalizations('config.get.name')
          )
          .setDescription('Get current guild config')
          .setDescriptionLocalizations(
            this._localizationService.getAllLocalizations(
              'config.get.description'
            )
          )
      ) as SlashCommandBuilder;
  }

  private async _executeSet(interaction: ChatInputCommandInteraction) {
    const i18n = this._localizationService.useScope(
      interaction.locale,
      'config.set.messages'
    );

    const timezone = interaction.options.getString('timezone', false);
    const newConfig: Partial<IGuildConfig> = {};

    if (timezone) {
      newConfig.timezone = timezone;
    }

    if (Object.keys(newConfig).length === 0) {
      await interaction.reply({
        content: i18n.mustLocalize('no-changes', 'No changes were made'),
        ephemeral: true,
      });
      return;
    }

    await this._guildConfigService.updateGuildConfig(
      interaction.guildId!,
      newConfig
    );

    await interaction.reply({
      content: i18n.mustLocalize('config-updated', 'Config updated'),
      ephemeral: true,
    });
  }

  private async _executeGet(interaction: ChatInputCommandInteraction) {
    const config = await this._guildConfigService.getGuildConfig(
      interaction.guildId!
    );

    await interaction.reply({
      content: `\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``,
      ephemeral: true,
    });
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
}
