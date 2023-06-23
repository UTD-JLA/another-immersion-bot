import {ICommand} from '.';
import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  GuildMember,
} from 'discord.js';
import {Activity, IActivity} from '../models/activity';
import {inject, injectable} from 'inversify';
import {IConfig, IColorConfig} from '../config';

@injectable()
export default class LeaderboardCommand implements ICommand {
  private readonly _colors: IColorConfig;

  constructor(@inject('Config') private readonly config: IConfig) {
    this._colors = config.colors;
  }

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

    const typeMatch = type ? {type} : {};
    const timeframeMatch = timeframe
      ? {date: {$gte: getStartOfTimeframe(timeframe)}}
      : {};

    const topMembers = <
      {_id: string; member?: GuildMember; duration: number}[]
    >await Activity.aggregate([
      {
        $match: {
          userId: {
            $in: guildMemberIds,
          },
          ...typeMatch,
          ...timeframeMatch,
        },
      },
      {
        $group: {
          _id: '$userId',
          duration: {
            $sum: '$duration',
          },
        },
      },
      {
        $sort: {
          duration: -1,
        },
      },
      {
        $limit: 10,
      },
    ]).then(docs =>
      docs.map(doc => ({
        _id: doc._id,
        member: interaction.guild!.members.cache.get(doc._id),
        duration: doc.duration,
      }))
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
          memberWithStats.member?.displayName ?? memberWithStats._id
        }`,
        value: minutesAsTimeString(memberWithStats.duration),
      }))
    );
    embed.setTimestamp(new Date());
    embed.setColor(this._colors.primary);
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
