import {ICommand} from '.';
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
} from 'discord.js';
import {injectable, inject} from 'inversify';
import {IUserConfigService, IGuildConfigService} from '../services';
import {IConfig} from '../config';
import {validateTimezone} from '../util/validation';

@injectable()
export default class UserConfigCommand implements ICommand {
  constructor(
    @inject('UserConfigService')
    private readonly _userConfigService: IUserConfigService,
    @inject('GuildConfigService')
    private readonly _guildConfigService: IGuildConfigService,
    @inject('Config')
    private readonly _config: IConfig
  ) {}

  public readonly data = <SlashCommandBuilder>new SlashCommandBuilder()
    .setName('user-config')
    .setDescription('Update your user experience')
    .addSubcommandGroup(group =>
      group
        .setName('get')
        .setDescription('Get your current user config')
        .addSubcommand(subcommand =>
          subcommand
            .setName('timezone')
            .setDescription('Get your current timezone')
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('reading-speed')
            .setDescription('Get your current reading speed')
        )
    )
    .addSubcommandGroup(group =>
      group
        .setName('set')
        .setDescription('Set your user config')
        .addSubcommand(subcommand =>
          subcommand
            .setName('timezone')
            .setDescription('Set your timezone')
            .addStringOption(option =>
              option
                .setName('timezone')
                .setDescription('Your timezone')
                .setRequired(true)
            )
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('reading-speed')
            .setDescription('Set your reading speed')
            .addIntegerOption(option =>
              option
                .setName('reading-speed')
                .setDescription('Your reading speed')
                .setRequired(true)
                .setMinValue(0)
            )
        )
    );

  public async execute(interaction: ChatInputCommandInteraction) {
    const group = interaction.options.getSubcommandGroup(true);

    if (group === 'get') {
      await this._executeGet(interaction);
    }

    if (group === 'set') {
      await this._executeSet(interaction);
    }
  }

  private async _executeSet(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand(true);

    if (subcommand === 'timezone') {
      const timezone = interaction.options.getString('timezone', true);

      const isValidTimezone = validateTimezone(timezone);
      if (!isValidTimezone) {
        await interaction.reply({
          content: 'Invalid timezone',
          ephemeral: true,
        });
        return;
      }

      await this._userConfigService.setTimezone(interaction.user.id, timezone);

      await interaction.reply({
        content: `Set your timezone to ${timezone}`,
        ephemeral: true,
      });
    } else if (subcommand === 'reading-speed') {
      const readingSpeed = interaction.options.getInteger(
        'reading-speed',
        true
      );

      await this._userConfigService.setReadingSpeed(
        interaction.user.id,
        readingSpeed
      );

      await interaction.reply({
        content: `Set your reading speed to ${readingSpeed}`,
        ephemeral: true,
      });
    }
  }

  private async _executeGet(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand(true);
    const embed = new EmbedBuilder()
      .setTitle('User Config')
      .setAuthor({
        name: interaction.user.username,
        iconURL: interaction.user.avatarURL()!,
      })
      .setColor(this._config.colors.info);

    if (subcommand === 'timezone') {
      const userTimezonePromise = this._userConfigService.getTimezone(
        interaction.user.id
      );

      const guildConfigPromise = interaction.guildId
        ? this._guildConfigService.getGuildConfig(interaction.guildId)
        : null;

      const [userTimezone, guildConfig] = await Promise.all([
        userTimezonePromise,
        guildConfigPromise,
      ]);

      const fields = [
        {
          name: 'Your Timezone',
          value: userTimezone ?? 'Not set',
        },
      ];

      if (interaction.guildId) {
        fields.push({
          name: 'Guild Timezone',
          value: guildConfig?.timezone ?? 'Not set',
        });
      }

      embed.addFields(fields);
    }

    if (subcommand === 'reading-speed') {
      const readingSpeed = await this._userConfigService.getReadingSpeed(
        interaction.user.id
      );

      embed.addFields({
        name: 'Reading Speed',
        value: readingSpeed?.toString() ?? 'Not set',
      });
    }

    await interaction.reply({embeds: [embed]});
  }

  public autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}
