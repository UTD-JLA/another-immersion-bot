import {ICommand} from '.';
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
} from 'discord.js';
import {injectable, inject} from 'inversify';
import {
  ILocalizationService,
  IUserConfigService,
  IUserSpeedService,
} from '../services';
import {IConfig} from '../config';
import {validateTimezone} from '../util/validation';
import {ActivityUnit} from '../models/activity';
import {getTimezones} from '../util/time';

@injectable()
export default class UserConfigCommand implements ICommand {
  constructor(
    @inject('UserConfigService')
    private readonly _userConfigService: IUserConfigService,
    @inject('Config')
    private readonly _config: IConfig,
    @inject('UserSpeedService')
    private readonly _userSpeedService: IUserSpeedService,
    @inject('LocalizationService')
    private readonly _localizationService: ILocalizationService
  ) {}

  public get data() {
    return new SlashCommandBuilder()
      .setName('user-config')
      .setNameLocalizations(
        this._localizationService.getAllLocalizations('user-config.name')
      )
      .setDescription('Update your user experience')
      .setDescriptionLocalizations(
        this._localizationService.getAllLocalizations('user-config.description')
      )
      .addSubcommand(group =>
        group
          .setName('show')
          .setNameLocalizations(
            this._localizationService.getAllLocalizations(
              'user-config.show.name'
            )
          )
          .setDescription('Get your current user config')
          .setDescriptionLocalizations(
            this._localizationService.getAllLocalizations(
              'user-config.show.description'
            )
          )
      )
      .addSubcommandGroup(group =>
        group
          .setName('set')
          .setNameLocalizations(
            this._localizationService.getAllLocalizations(
              'user-config.set.name'
            )
          )
          .setDescription('Set your user config')
          .setDescriptionLocalizations(
            this._localizationService.getAllLocalizations(
              'user-config.set.description'
            )
          )
          .addSubcommand(subcommand =>
            subcommand
              .setName('timezone')
              .setNameLocalizations(
                this._localizationService.getAllLocalizations(
                  'user-config.set.timezone.name'
                )
              )
              .setDescription('Set your timezone')
              .setDescriptionLocalizations(
                this._localizationService.getAllLocalizations(
                  'user-config.set.timezone.description'
                )
              )
              .addStringOption(option =>
                option
                  .setName('timezone')
                  .setNameLocalizations(
                    this._localizationService.getAllLocalizations(
                      'user-config.set.timezone.timezone.name'
                    )
                  )
                  .setDescription('Your timezone')
                  .setDescriptionLocalizations(
                    this._localizationService.getAllLocalizations(
                      'user-config.set.timezone.timezone.description'
                    )
                  )
                  .setRequired(true)
                  .setAutocomplete(true)
              )
          )
          .addSubcommand(subcommand =>
            subcommand
              .setName('reading-speed')
              .setNameLocalizations(
                this._localizationService.getAllLocalizations(
                  'user-config.set.reading-speed.name'
                )
              )
              .setDescription('Set your reading speed')
              .setDescriptionLocalizations(
                this._localizationService.getAllLocalizations(
                  'user-config.set.reading-speed.description'
                )
              )
              .addNumberOption(option =>
                option
                  .setName('reading-speed')
                  .setNameLocalizations(
                    this._localizationService.getAllLocalizations(
                      'user-config.set.reading-speed.reading-speed.name'
                    )
                  )
                  .setDescription('Your reading speed')
                  .setDescriptionLocalizations(
                    this._localizationService.getAllLocalizations(
                      'user-config.set.reading-speed.reading-speed.description'
                    )
                  )
                  .setRequired(false)
                  .setMinValue(0)
                  .setMaxValue(1000)
                  .setAutocomplete(true)
              )
              .addNumberOption(option =>
                option
                  .setName('manga-page-speed')
                  .setNameLocalizations(
                    this._localizationService.getAllLocalizations(
                      'user-config.set.reading-speed.manga-page-speed.name'
                    )
                  )
                  .setDescription('Your manga page speed')
                  .setDescriptionLocalizations(
                    this._localizationService.getAllLocalizations(
                      'user-config.set.reading-speed.manga-page-speed.description'
                    )
                  )
                  .setRequired(false)
                  .setMinValue(0)
                  .setMaxValue(20)
                  .setAutocomplete(true)
              )
              .addNumberOption(option =>
                option
                  .setName('book-page-speed')
                  .setNameLocalizations(
                    this._localizationService.getAllLocalizations(
                      'user-config.set.reading-speed.book-page-speed.name'
                    )
                  )
                  .setDescription('Your book page speed')
                  .setDescriptionLocalizations(
                    this._localizationService.getAllLocalizations(
                      'user-config.set.reading-speed.book-page-speed.description'
                    )
                  )
                  .setRequired(false)
                  .setMinValue(0)
                  .setMaxValue(10)
                  .setAutocomplete(true)
              )
          )
          .addSubcommand(subcommand =>
            subcommand
              .setName('daily-goal')
              .setNameLocalizations(
                this._localizationService.getAllLocalizations(
                  'user-config.set.daily-goal.name'
                )
              )
              .setDescription('Set your daily goal')
              .setDescriptionLocalizations(
                this._localizationService.getAllLocalizations(
                  'user-config.set.daily-goal.description'
                )
              )
              .addIntegerOption(option =>
                option
                  .setName('daily-goal')
                  .setNameLocalizations(
                    this._localizationService.getAllLocalizations(
                      'user-config.set.daily-goal.daily-goal.name'
                    )
                  )
                  .setDescription('Your daily goal')
                  .setDescriptionLocalizations(
                    this._localizationService.getAllLocalizations(
                      'user-config.set.daily-goal.daily-goal.description'
                    )
                  )
                  .setRequired(true)
                  .setMinValue(0)
                  .setMaxValue(1440)
              )
          )
      ) as SlashCommandBuilder;
  }

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
    const i18n = this._localizationService.useScope(
      interaction.locale,
      'user-config.show.messages'
    );

    await interaction.deferReply({ephemeral: true});

    const config = await this._userConfigService.getUserConfig(
      interaction.user.id
    );

    const embed = new EmbedBuilder()
      .setTitle(i18n.mustLocalize('user-config-title', 'User Config'))
      .setAuthor({
        name: interaction.user.username,
        iconURL: interaction.user.avatarURL()!,
      })
      .setColor(this._config.colors.info)
      .addFields([
        {
          name: i18n.mustLocalize('timezone', 'Timezone'),
          value: config.timezone ?? i18n.mustLocalize('not-set', 'Not set'),
        },
        {
          name: i18n.mustLocalize('daily-goal', 'Daily Goal'),
          value:
            config.dailyGoal?.toString() ??
            i18n.mustLocalize('not-set', 'Not set'),
        },
        {
          name: i18n.mustLocalize('reading-speed', 'Reading Speed'),
          value:
            config.readingSpeed?.toPrecision(3) ??
            i18n.mustLocalize('not-set', 'Not set'),
        },
        {
          name: i18n.mustLocalize('reading-speed-pages', 'Reading Speed Manga'),
          value:
            config.readingSpeedPages?.toPrecision(3) ??
            i18n.mustLocalize('not-set', 'Not set'),
        },
        {
          name: i18n.mustLocalize('reading-speed-books', 'Reading Speed Books'),
          value:
            config.readingSpeedBookPages?.toPrecision(3) ??
            i18n.mustLocalize('not-set', 'Not set'),
        },
      ]);

    await interaction.editReply({embeds: [embed]});
  }

  private async _executeSet(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand(true);
    const i18n = this._localizationService.useScope(
      interaction.locale,
      'user-config.set.messages'
    );

    if (subcommand === 'timezone') {
      const timezone = interaction.options.getString('timezone', true);

      const isValidTimezone = validateTimezone(timezone);
      if (!isValidTimezone) {
        await interaction.reply({
          content: i18n.mustLocalize('invalid-timezone', 'Invalid timezone'),
          ephemeral: true,
        });
        return;
      }

      await this._userConfigService.setTimezone(interaction.user.id, timezone);

      await interaction.reply({
        content: i18n.mustLocalize(
          'timezone-set',
          `Timezone set to ${timezone}`,
          timezone
        ),
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

      const bookSpeed = interaction.options.getNumber('book-page-speed', false);

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

      if (bookSpeed)
        await this._userConfigService.setBookPageReadingSpeed(
          interaction.user.id,
          bookSpeed
        );

      const fields = [];

      if (readingSpeed)
        fields.push({
          name: i18n.mustLocalize('new-reading-speed', 'New Reading Speed'),
          value: readingSpeed.toString(),
        });

      if (mangaSpeed)
        fields.push({
          name: i18n.mustLocalize('new-pages-speed', 'New Pages Speed'),
          value: mangaSpeed.toString(),
        });

      if (bookSpeed)
        fields.push({
          name: i18n.mustLocalize('new-book-speed', 'New Book Speed'),
          value: bookSpeed.toString(),
        });

      if (fields.length === 0) {
        await interaction.reply({
          content: i18n.mustLocalize('no-arguments', 'No arguments provided'),
          ephemeral: true,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(this._config.colors.info)
        .setTitle(i18n.mustLocalize('reading-speed-set', 'Reading Speed Set'))
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
        content: i18n.mustLocalize(
          'daily-goal-set',
          `Daily goal set to ${dailyGoal}`,
          dailyGoal.toString()
        ),
        ephemeral: true,
      });
    }
  }

  public async autocomplete(
    interaction: AutocompleteInteraction
  ): Promise<void> {
    const i18n = this._localizationService.useScope(
      interaction.locale,
      'user-config.autocomplete'
    );

    const group = interaction.options.getSubcommandGroup(false);

    if (!group || group !== 'set') {
      throw new Error('Invalid autocomplete');
    }

    const subcommand = interaction.options.getSubcommand(true);

    if (subcommand === 'reading-speed') {
      const focused = interaction.options.getFocused(true);
      const unit =
        focused.name === 'reading-speed'
          ? ActivityUnit.Character
          : focused.name === 'manga-page-speed'
          ? ActivityUnit.Page
          : ActivityUnit.BookPage;
      const unitChar = unit === ActivityUnit.Character ? 'c' : 'p';

      const predictedSpeed = await this._userSpeedService.predictSpeed(
        interaction.user.id,
        unit
      );

      if (predictedSpeed === 0) {
        return interaction.respond([]);
      }

      const predictedValueString = i18n.mustLocalize(
        'predicted-speed-value',
        'Predicted value'
      );

      interaction.respond([
        {
          name: `${predictedValueString}: ${predictedSpeed.toPrecision(
            3
          )} ${unitChar}pm`,
          value: predictedSpeed,
        },
      ]);
    } else if (subcommand === 'timezone') {
      const focused = interaction.options.getFocused(true);
      const timezones = getTimezones();

      const filteredTimezones = timezones.filter(timezone =>
        timezone
          .toLowerCase()
          .includes(focused.value.toLowerCase().replace(' ', '_'))
      );

      const options = filteredTimezones.map(timezone => ({
        name: timezone,
        value: timezone,
      }));

      interaction.respond(options.slice(0, 25));
    } else {
      throw new Error('Invalid autocomplete');
    }
  }
}
