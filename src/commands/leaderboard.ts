import {ICommand} from '.';
import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
} from 'discord.js';
import {inject, injectable} from 'inversify';
import {IConfig} from '../config';
import {IActivityService} from '../services/interfaces';
import {ActivityType} from '../models/activity';

@injectable()
export default class LeaderboardCommand implements ICommand {
  constructor(
    @inject('Config') private readonly _config: IConfig,
    @inject('ActivityService')
    private readonly _activityService: IActivityService
  ) {}

  public readonly data = <SlashCommandBuilder>new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the leaderboard')
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('Type of the leaderboard')
        .setRequired(false)
        .addChoices(
          {
            name: 'Listening',
            value: 'listening',
          },
          {
            name: 'Reading',
            value: 'reading',
          }
        )
    )
    .addStringOption(option =>
      option
        .setName('timeframe')
        .setDescription('Timeframe of the leaderboard')
        .setRequired(false)
        .addChoices(
          {
            name: 'Today',
            value: 'today',
          },
          {
            name: 'This week',
            value: 'this-week',
          },
          {
            name: 'This month',
            value: 'this-month',
          },
          {
            name: 'This year',
            value: 'this-year',
          }
        )
    )
    .setDMPermission(false);

  public async execute(interaction: ChatInputCommandInteraction) {
    const type = interaction.options.getString('type');

    if (type && !Object.values(ActivityType).includes(type as ActivityType)) {
      await interaction.reply({
        content: 'Invalid type',
        ephemeral: true,
      });
      return;
    }

    const timeframe = interaction.options.getString('timeframe');
    if (!interaction.guild) {
      await interaction.reply({
        content: 'This command can only be used in a server',
        ephemeral: true,
      });
      return;
    }

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
        content: 'No one has logged any activity yet',
      });
      return;
    }

    const embed = new EmbedBuilder();
    embed.setTitle('Leaderboard');
    embed.setDescription(
      `Top 10 users in this server${type ? ` for ${type}` : ''}`
    );
    embed.setFields(
      topMembers.map((memberWithStats, index) => ({
        name: `${index + 1}. ${
          interaction.guild?.members.cache.get(memberWithStats.discordId)
            ?.displayName ?? memberWithStats.discordId
        }`,
        value: minutesAsTimeString(memberWithStats.duration),
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

function minutesAsTimeString(totalMinutes: number) {
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes - days * 1440) / 60);
  const minutes = Math.floor(totalMinutes - days * 1440 - hours * 60);

  let string = '';

  if (days > 0) {
    string += `${days} days, `;
  }

  if (hours > 0) {
    string += `${hours} hours, `;
  }

  string += `${minutes} minutes`;

  return string;
}
