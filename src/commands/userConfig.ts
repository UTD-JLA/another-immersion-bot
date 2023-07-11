import {ICommand} from '.';
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
} from 'discord.js';
import {injectable, inject} from 'inversify';
import {
  IUserConfigService,
  IGuildConfigService,
  IUserSpeedService,
} from '../services';
import {IConfig} from '../config';
import {validateTimezone} from '../util/validation';
import {ActivityUnit} from '../models/activity';

@injectable()
export default class UserConfigCommand implements ICommand {
  constructor(
    @inject('UserConfigService')
    private readonly _userConfigService: IUserConfigService,
    @inject('GuildConfigService')
    private readonly _guildConfigService: IGuildConfigService,
    @inject('Config')
    private readonly _config: IConfig,
    @inject('UserSpeedService')
    private readonly _userSpeedService: IUserSpeedService
  ) {}

  public readonly data = <SlashCommandBuilder>new SlashCommandBuilder()
    .setName('user-config')
    .setDescription('Update your user experience')
    .addSubcommand(group =>
      group.setName('get-all').setDescription('Get your current user config')
    )
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
        .addSubcommand(subcommand =>
          subcommand
            .setName('daily-goal')
            .setDescription('Get your current daily goal')
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
                .setAutocomplete(true)
            )
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('daily-goal')
            .setDescription('Set your daily goal')
            .addIntegerOption(option =>
              option
                .setName('daily-goal')
                .setDescription('Your daily goal')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(1440)
            )
        )
    );

  public async execute(interaction: ChatInputCommandInteraction) {
    const group = interaction.options.getSubcommandGroup(false);

    if (!group) {
      const subcommand = interaction.options.getSubcommand(true);
      if (subcommand === 'get-all') {
        await this._executeGetAll(interaction);
      }
      return;
    }

    if (group === 'get') {
      await this._executeGet(interaction);
    }

    if (group === 'set') {
      await this._executeSet(interaction);
    }
  }

  private async _executeGetAll(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ephemeral: true});

    const config = await this._userConfigService.getUserConfig(
      interaction.user.id
    );

    const embed = new EmbedBuilder()
      .setTitle('User Config')
      .setAuthor({
        name: interaction.user.username,
        iconURL: interaction.user.avatarURL()!,
      })
      .setColor(this._config.colors.info)
      .addFields([
        {
          name: 'Your Timezone',
          value: config.timezone ?? 'Not set',
        },
        {
          name: 'Your Reading Speed',
          value: config.readingSpeed?.toString() ?? 'Not set',
        },
        {
          name: 'Your Daily Goal',
          value: config.dailyGoal?.toString() ?? 'Not set',
        },
      ]);

    await interaction.editReply({embeds: [embed]});
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
    } else if (subcommand === 'daily-goal') {
      const dailyGoal = interaction.options.getInteger('daily-goal', true);

      await this._userConfigService.setDailyGoal(
        interaction.user.id,
        dailyGoal
      );

      await interaction.reply({
        content: `Set your daily goal to ${dailyGoal}`,
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
    } else if (subcommand === 'reading-speed') {
      const readingSpeed = await this._userConfigService.getReadingSpeed(
        interaction.user.id
      );

      const [predictedCharSpeed, predictedPageSpeed] = await Promise.all(
        [ActivityUnit.Character, ActivityUnit.Page].map(unit =>
          this._userSpeedService.predictSpeed(interaction.user.id, unit)
        )
      );

      embed.addFields(
        {
          name: 'Reading Speed',
          value: readingSpeed?.toString() ?? 'Not set',
        },
        {
          name: 'Predicted Speed',
          value: `Character: ${predictedCharSpeed.toPrecision(
            3
          )} cpm\nPage (Manga): ${predictedPageSpeed.toPrecision(3)} ppm`,
        }
      );
    } else if (subcommand === 'daily-goal') {
      const dailyGoal = await this._userConfigService.getDailyGoal(
        interaction.user.id
      );

      embed.addFields({
        name: 'Daily Goal',
        value: dailyGoal ? `${dailyGoal} minutes` : 'Not set',
      });
    }

    await interaction.reply({embeds: [embed]});
  }

  public async autocomplete(
    interaction: AutocompleteInteraction
  ): Promise<void> {
    const group = interaction.options.getSubcommandGroup(false);

    if (!group || group !== 'set') {
      throw new Error('Invalid autocomplete');
    }

    const subcommand = interaction.options.getSubcommand(true);

    if (subcommand !== 'reading-speed') {
      throw new Error('Invalid autocomplete');
    }

    const predictedSpeed = await this._userSpeedService.predictSpeed(
      interaction.user.id,
      ActivityUnit.Character
    );

    if (!predictedSpeed) {
      return interaction.respond([]);
    }

    interaction.respond([
      {
        name: `Predicted value: ${predictedSpeed.toPrecision(3)} } cpm`,
        value: predictedSpeed,
      },
    ]);
  }
}
