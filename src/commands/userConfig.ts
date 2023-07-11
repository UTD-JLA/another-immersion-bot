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
      group.setName('show').setDescription('Get your current user config')
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
            .addNumberOption(option =>
              option
                .setName('reading-speed')
                .setDescription('Your reading speed')
                .setRequired(false)
                .setMinValue(0)
                .setMaxValue(1000)
                .setAutocomplete(true)
            )
            .addNumberOption(option =>
              option
                .setName('manga-page-speed')
                .setDescription('Your manga page speed')
                .setRequired(false)
                .setMinValue(0)
                .setMaxValue(20)
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
      if (subcommand === 'show') {
        await this._executeGetAll(interaction);
      }
      return;
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
          name: 'Timezone',
          value: config.timezone ?? 'Not set',
          inline: true,
        },
        {
          name: 'Daily Goal',
          value: config.dailyGoal?.toString() ?? 'Not set',
          inline: true,
        },
        {
          name: 'Reading Speed',
          value: config.readingSpeed?.toPrecision(3) ?? 'Not set',
          inline: true,
        },
        {
          name: 'Manga Page Speed',
          value: config.readingSpeedPages?.toPrecision(3) ?? 'Not set',
          inline: true,
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
      const readingSpeed = interaction.options.getNumber(
        'reading-speed',
        false
      );

      const mangaSpeed = interaction.options.getNumber(
        'manga-page-speed',
        false
      );

      if (readingSpeed)
        await this._userConfigService.setReadingSpeed(
          interaction.user.id,
          readingSpeed
        );

      if (mangaSpeed)
        await this._userConfigService.setPageReadingSpeed(
          interaction.user.id,
          mangaSpeed
        );

      const fields = [];

      if (readingSpeed)
        fields.push({
          name: 'New Reading Speed',
          value: readingSpeed.toString(),
        });

      if (mangaSpeed)
        fields.push({
          name: 'New Manga Page Speed',
          value: mangaSpeed.toString(),
        });

      if (fields.length === 0) {
        await interaction.reply({
          content: 'You must provide at least one option',
          ephemeral: true,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(this._config.colors.info)
        .setTitle('Reading Speed')
        .setAuthor({
          name: interaction.user.username,
          iconURL: interaction.user.avatarURL()!,
        })
        .setFields(fields);

      await interaction.reply({embeds: [embed]});
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

    const focused = interaction.options.getFocused(true);
    const unit =
      focused.name === 'reading-speed'
        ? ActivityUnit.Character
        : ActivityUnit.Page;
    const unitChar = unit === ActivityUnit.Character ? 'c' : 'p';

    const predictedSpeed = await this._userSpeedService.predictSpeed(
      interaction.user.id,
      unit
    );

    if (predictedSpeed === 0) {
      return interaction.respond([]);
    }

    interaction.respond([
      {
        name: `Predicted value: ${predictedSpeed.toPrecision(3)} ${unitChar}pm`,
        value: predictedSpeed,
      },
    ]);
  }
}
