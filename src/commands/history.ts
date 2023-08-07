import {ICommand} from '.';
import {IColorConfig, IConfig} from '../config';
import {IActivity} from '../models/activity';
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonStyle,
  Locale,
} from 'discord.js';
import {inject, injectable} from 'inversify';
import {IGuildConfigService, IUserConfigService} from '../services';
import {getUserTimezone} from '../util/time';
import {IActivityService, ILocalizationService} from '../services';
import {LocalizationScope} from '../services/interfaces/localizationService';

@injectable()
export default class HistoryCommand implements ICommand {
  private readonly _colors: IColorConfig;
  private readonly _userConfigService: IUserConfigService;
  private readonly _guildConfigService: IGuildConfigService;
  private readonly _activityService: IActivityService;
  private readonly _localizationService: ILocalizationService;

  constructor(
    @inject('Config') config: IConfig,
    @inject('UserConfigService') userConfigService: IUserConfigService,
    @inject('GuildConfigService') guildConfigService: IGuildConfigService,
    @inject('ActivityService') activityService: IActivityService,
    @inject('LocalizationService') localizationService: ILocalizationService
  ) {
    this._colors = config.colors;
    this._userConfigService = userConfigService;
    this._guildConfigService = guildConfigService;
    this._activityService = activityService;
    this._localizationService = localizationService;
  }

  public get data() {
    return <SlashCommandBuilder>new SlashCommandBuilder()
      .setName('history')
      .setNameLocalizations(
        this._localizationService.getAllLocalizations('history.name')
      )
      .setDescription('Show your activity history')
      .setDescriptionLocalizations(
        this._localizationService.getAllLocalizations('history.description')
      )
      .addUserOption(option =>
        option
          .setName('user')
          .setNameLocalizations(
            this._localizationService.getAllLocalizations('history.user.name')
          )
          .setDescription('User to show the history of')
          .setDescriptionLocalizations(
            this._localizationService.getAllLocalizations(
              'history.user.description'
            )
          )
          .setRequired(false)
      )
      .addBooleanOption(option =>
        option
          .setName('show-ids')
          .setNameLocalizations(
            this._localizationService.getAllLocalizations(
              'history.show-ids.name'
            )
          )
          .setDescription('Show the ids of the activities')
          .setDescriptionLocalizations(
            this._localizationService.getAllLocalizations(
              'history.show-ids.description'
            )
          )
          .setRequired(false)
      )
      .addBooleanOption(option =>
        option
          .setName('simple')
          .setNameLocalizations(
            this._localizationService.getAllLocalizations('history.simple.name')
          )
          .setDescription('Display the history in a simple format')
          .setDescriptionLocalizations(
            this._localizationService.getAllLocalizations(
              'history.simple.description'
            )
          )
          .setRequired(false)
      );
  }

  public async execute(interaction: ChatInputCommandInteraction) {
    const i18n = this._localizationService.useScope(
      interaction.locale,
      'history.messages'
    );
    const userId =
      interaction.options.getUser('user')?.id ?? interaction.user.id;
    const showIds = interaction.options.getBoolean('show-ids') ?? false;
    const simple = interaction.options.getBoolean('simple') ?? false;

    // TODO: Do not fetch all activities at once
    const [activities, timezone] = await Promise.all([
      this._activityService.getActivities(userId),
      getUserTimezone(
        this._userConfigService,
        this._guildConfigService,
        interaction.user.id,
        interaction.guild?.id
      ),
    ]);

    if (activities.length === 0) {
      await interaction.reply(
        i18n.mustLocalize('no-activities', 'No activities found')
      );
      return;
    }

    const nextButton = new ButtonBuilder()
      .setCustomId('next')
      .setLabel(i18n.mustLocalize('next', 'Next'))
      .setStyle(ButtonStyle.Primary);

    const previousButton = new ButtonBuilder()
      .setCustomId('previous')
      .setLabel(i18n.mustLocalize('previous', 'Previous'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      previousButton,
      nextButton
    );

    let page = 0;
    const pageSize = simple ? 10 : 6;
    const nPages = Math.ceil(activities.length / pageSize);
    const createEmbed = simple ? this._createSimpleEmbed : this._createEmbed;

    let embed = createEmbed.call(
      this,
      i18n,
      activities.slice(0, pageSize),
      showIds,
      page,
      nPages,
      timezone,
      interaction.locale
    );

    const response = await interaction.reply({
      embeds: [embed],
      components: nPages > 1 ? [row] : [],
    });

    if (nPages <= 1) {
      return;
    }

    const collector = response.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 1000 * 60,
    });

    collector.on('collect', async i => {
      switch (i.customId) {
        case 'next':
          page++;
          break;
        case 'previous':
          page--;
          break;
      }

      if (page < 0) {
        page = 0;
      }

      if (page * pageSize + pageSize > activities.length) {
        page = nPages - 1;
      }

      const startIndex = page * pageSize;
      const endIndex = Math.min(startIndex + pageSize, activities.length);

      embed = createEmbed.call(
        this,
        i18n,
        activities.slice(startIndex, endIndex),
        showIds,
        page,
        nPages,
        timezone,
        interaction.locale
      );

      previousButton.setDisabled(page === 0);
      nextButton.setDisabled(page === nPages - 1);

      await i.update({
        embeds: [embed],
        components: [row],
      });
    });
  }

  private _createSimpleEmbed(
    i18n: LocalizationScope,
    activities: IActivity[],
    showIds: boolean,
    page: number,
    nPages: number
  ): EmbedBuilder {
    const pageString = i18n.mustLocalize(
      'page-n-of-m',
      `Page ${page + 1} of ${nPages}`,
      page + 1,
      nPages
    );

    const embed = new EmbedBuilder()
      .setTitle(i18n.mustLocalize('history-title', 'History'))
      .setDescription(
        activities
          .map(
            activity =>
              `**${activity.date
                .toISOString()
                .slice(0, 10)}** (${i18n.mustLocalize(
                'n-minutes',
                `${Math.round(activity.duration)} minutes`,
                Math.round(activity.duration)
              )}): ${activity.type} - ${activity.name}` +
              (showIds ? `\n<${activity.id}>` : '')
          )
          .join('\n')
      )
      .setFooter({text: pageString});

    embed.setColor(
      page % 2 === 0 ? this._colors.primary : this._colors.secondary
    );

    return embed;
  }

  private _createEmbed(
    i18n: LocalizationScope,
    activities: IActivity[],
    showIds: boolean,
    page: number,
    nPages: number,
    timezone: string,
    locale: Locale
  ): EmbedBuilder {
    const pageString = i18n.mustLocalize(
      'page-n-of-m',
      `Page ${page + 1} of ${nPages}`,
      page + 1,
      nPages
    );

    const timezoneShownString = i18n.mustLocalize(
      'timezone-shown',
      `Times shown in timezone: ${timezone}`,
      timezone
    );

    const embed = new EmbedBuilder()
      .setTitle(i18n.mustLocalize('history-title', 'History'))
      .setFields(
        activities.map(activity => ({
          name: `${activity.date.toLocaleDateString(locale, {
            timeZone: timezone,
          })} ${activity.date.toLocaleTimeString(locale, {
            timeZone: timezone,
          })}`,
          value: `${activity.name}\n(${i18n.mustLocalize(
            'n-minutes',
            `${Math.round(activity.duration)} minutes`,
            Math.round(activity.duration)
          )}) ${showIds ? `<${activity.id}>` : ''}`,
          inline: true,
        }))
      )
      .setDescription(timezoneShownString);

    if (nPages > 1) {
      embed.setFooter({text: pageString});
    }

    embed.setColor(
      page % 2 === 0 ? this._colors.primary : this._colors.secondary
    );

    return embed;
  }
}
