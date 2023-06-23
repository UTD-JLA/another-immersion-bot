import {ICommand} from '.';
import {IColorConfig, IConfig} from '../config';
import {Activity, IActivity} from '../models/activity';
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonStyle,
} from 'discord.js';
import {inject, injectable} from 'inversify';
import {IGuildConfigService, IUserConfigService} from '../services';
import {getUserTimezone} from '../util/time';

@injectable()
export default class HistoryCommand implements ICommand {
  private readonly _colors: IColorConfig;
  private readonly _userConfigService: IUserConfigService;
  private readonly _guildConfigService: IGuildConfigService;

  constructor(
    @inject('Config') private readonly config: IConfig,
    @inject('UserConfigService') userConfigService: IUserConfigService,
    @inject('GuildConfigService') guildConfigService: IGuildConfigService
  ) {
    this._colors = config.colors;
    this._userConfigService = userConfigService;
    this._guildConfigService = guildConfigService;
  }

  public readonly data = <SlashCommandBuilder>new SlashCommandBuilder()
    .setName('history')
    .setDescription('Show your activity history')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to show the history of')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option
        .setName('show-ids')
        .setDescription('Show the ids of the activities')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option
        .setName('simple')
        .setDescription('Display the history in a simple format')
        .setRequired(false)
    );

  public async execute(interaction: ChatInputCommandInteraction) {
    const userId =
      interaction.options.getUser('user')?.id ?? interaction.user.id;
    const showIds = interaction.options.getBoolean('show-ids') ?? false;
    const simple = interaction.options.getBoolean('simple') ?? false;

    // TODO: Do not fetch all activities at once
    const [activities, timezone] = await Promise.all([
      Activity.find({userId}).sort({date: -1}),
      getUserTimezone(
        this._userConfigService,
        this._guildConfigService,
        interaction.user.id,
        interaction.guild?.id
      ),
    ]);

    if (activities.length === 0) {
      await interaction.reply('No logs found');
      return;
    }

    const nextButton = new ButtonBuilder()
      .setCustomId('next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary);

    const previousButton = new ButtonBuilder()
      .setCustomId('previous')
      .setLabel('Previous')
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
      activities.slice(0, pageSize),
      showIds,
      page,
      nPages,
      timezone
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
        activities.slice(startIndex, endIndex),
        showIds,
        page,
        nPages,
        timezone
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
    activities: IActivity[],
    showIds: boolean,
    page: number,
    nPages: number
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle('History')
      .setDescription(
        activities
          .map(
            activity =>
              `**${activity.date.toISOString().slice(0, 10)}** (${
                activity.formattedDuration ?? activity.duration
              }): ${activity.type} - ${activity.name}` +
              (showIds ? `\n<${activity._id}>` : '')
          )
          .join('\n')
      )
      .setFooter({text: `Page ${page + 1} of ${nPages}`});

    embed.setColor(
      page % 2 === 0 ? this._colors.primary : this._colors.secondary
    );

    return embed;
  }

  private _createEmbed(
    activities: IActivity[],
    showIds: boolean,
    page: number,
    nPages: number,
    timezone: string
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle('History')
      .setFields(
        activities.map(activity => ({
          name: `${activity.date.toLocaleDateString(undefined, {
            timeZone: timezone,
          })} ${activity.date.toLocaleTimeString(undefined, {
            timeZone: timezone,
          })}`,
          value: `${activity.name}\n(${
            activity.roundedDuration ?? activity.duration
          } minutes) ${showIds ? `<${activity._id}>` : ''}`,
          inline: true,
        }))
      )
      .setDescription(`Times shown in timezone: ${timezone}`);

    if (nPages > 1) {
      embed.setFooter({text: `Page ${page + 1} of ${nPages}`});
    }

    embed.setColor(
      page % 2 === 0 ? this._colors.primary : this._colors.secondary
    );

    return embed;
  }
}
