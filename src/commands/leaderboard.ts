import {ICommand} from '.';
import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
} from 'discord.js';
import {inject, injectable} from 'inversify';
import {IConfig} from '../config';
import {
  IActivityService,
  ILocalizationService,
  LocalizationScope,
} from '../services/interfaces';
import {ActivityType} from '../models/activity';

@injectable()
export default class LeaderboardCommand implements ICommand {
  constructor(
    @inject('Config') private readonly _config: IConfig,
    @inject('ActivityService')
    private readonly _activityService: IActivityService,
    @inject('LocalizationService')
    private readonly _localizationService: ILocalizationService
  ) {}

  public readonly data = <SlashCommandBuilder>new SlashCommandBuilder()
    .setName('leaderboard')
    .setNameLocalizations(
      this._localizationService.getAllLocalizations('leaderboard.name')
    )
    .setDescription('Show the leaderboard')
    .setDescriptionLocalizations(
      this._localizationService.getAllLocalizations('leaderboard.description')
    )
    .addStringOption(option =>
      option
        .setName('type')
        .setNameLocalizations(
          this._localizationService.getAllLocalizations('leaderboard.type.name')
        )
        .setDescription('Type of the leaderboard')
        .setDescriptionLocalizations(
          this._localizationService.getAllLocalizations(
            'leaderboard.type.description'
          )
        )
        .setRequired(false)
        .addChoices(
          {
            name: 'Listening',
            value: 'listening',
            name_localizations: this._localizationService.getAllLocalizations(
              'leaderboard.type.listening.name'
            ),
          },
          {
            name: 'Reading',
            value: 'reading',
            name_localizations: this._localizationService.getAllLocalizations(
              'leaderboard.type.reading.name'
            ),
          }
        )
    )
    .addStringOption(option =>
      option
        .setName('timeframe')
        .setNameLocalizations(
          this._localizationService.getAllLocalizations(
            'leaderboard.timeframe.name'
          )
        )
        .setDescription('Timeframe of the leaderboard')
        .setDescriptionLocalizations(
          this._localizationService.getAllLocalizations(
            'leaderboard.timeframe.description'
          )
        )
        .setRequired(false)
        .addChoices(
          {
            name: 'Today',
            value: 'today',
            name_localizations: this._localizationService.getAllLocalizations(
              'leaderboard.timeframe.today.name'
            ),
          },
          {
            name: 'This week',
            value: 'this-week',
            name_localizations: this._localizationService.getAllLocalizations(
              'leaderboard.timeframe.this-week.name'
            ),
          },
          {
            name: 'This month',
            value: 'this-month',
            name_localizations: this._localizationService.getAllLocalizations(
              'leaderboard.timeframe.this-month.name'
            ),
          },
          {
            name: 'This year',
            value: 'this-year',
            name_localizations: this._localizationService.getAllLocalizations(
              'leaderboard.timeframe.this-year.name'
            ),
          }
        )
    )
    .setDMPermission(false);

  public async execute(interaction: ChatInputCommandInteraction) {
    const type = interaction.options.getString('type') as ActivityType | null;

    // This shouldn't be possible
    if (type && !Object.values(ActivityType).includes(type as ActivityType)) {
      throw new Error(`Invalid activity type: ${type}`);
    }

    const timeframe = interaction.options.getString('timeframe');

    // This shouldn't be possible
    if (!interaction.guild) {
      throw new Error('Interaction is not in a guild');
    }

    const i18n = this._localizationService.useScope(
      interaction.locale,
      'leaderboard.messages'
    );

    await interaction.deferReply();

    const guildMemberIds = await interaction
      .guild!.members.fetch()
      .then(members => members.map(m => m.id));

    const topMembers = await this._activityService.getTopMembers(
      guildMemberIds,
      10,
      timeframe ? getStartOfTimeframe(timeframe) : undefined,
      type as ActivityType | undefined
    );

    if (topMembers.length === 0) {
      await interaction.editReply({
        content: i18n.mustLocalize(
          'no-results',
          'No one has logged any activity yet'
        ),
      });
      return;
    }

    const topTenMessage = i18n.mustLocalize(
      `top-ten${type ? `-${type}` : ''}`,
      `Top 10 users in this server${type ? ` for ${type}` : ''}`
    );

    const embed = new EmbedBuilder();
    embed.setTitle(i18n.mustLocalize('leaderboard-title', 'Leaderboard'));
    embed.setDescription(topTenMessage);
    embed.setFields(
      topMembers.map((memberWithStats, index) => ({
        name: `${index + 1}. ${
          interaction.guild?.members.cache.get(memberWithStats.discordId)
            ?.displayName ?? memberWithStats.discordId
        }`,
        value: minutesAsTimeString(i18n, memberWithStats.duration),
      }))
    );
    embed.setTimestamp(new Date());
    embed.setColor(this._config.colors.primary);
    await interaction.editReply({embeds: [embed]});
  }
}

function getStartOfTimeframe(timeframe: string): Date {
  const now = new Date();
  switch (timeframe) {
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case 'this-week':
      return new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - now.getDay()
      );
    case 'this-month':
      return new Date(now.getFullYear(), now.getMonth());
    case 'this-year':
      return new Date(now.getFullYear(), 0);
    default:
      throw new Error(`Invalid timeframe: ${timeframe}`);
  }
}

function minutesAsTimeString(i18n: LocalizationScope, totalMinutes: number) {
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes - days * 1440) / 60);
  const minutes = Math.floor(totalMinutes - days * 1440 - hours * 60);

  let string = '';

  if (days > 0) {
    const localized = i18n.localize('duration-days', days, hours, minutes);
    if (localized) {
      return localized;
    }
    string += `${days} days, `;
  }

  if (hours > 0) {
    const localized = i18n.localize('duration-hours', hours, minutes);
    if (localized) {
      return localized;
    }
    string += `${hours} hours, `;
  }

  const localized = i18n.localize('duration-minutes', minutes);
  if (localized) {
    return localized;
  }
  string += `${minutes} minutes`;

  return string;
}
