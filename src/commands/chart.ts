import {ICommand} from '.';
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import {injectable, inject} from 'inversify';
import {IChartService} from '../services';
import {Activity} from '../models/activity';
import {AttachmentBuilder} from 'discord.js';
import {IConfig, IColorConfig} from '../config';
import {IUserConfigService, IGuildConfigService} from '../services';
import {parseTimeWithUserTimezone, calculateDeltaInDays} from '../util/time';

@injectable()
export default class ChartCommand implements ICommand {
  private readonly _chartService: IChartService;
  private readonly _colors: IColorConfig;
  private readonly _userService: IUserConfigService;
  private readonly _guildService: IGuildConfigService;

  constructor(
    @inject('ChartService') chartService: IChartService,
    @inject('Config') config: IConfig,
    @inject('UserConfigService') userService: IUserConfigService,
    @inject('GuildConfigService') guildService: IGuildConfigService
  ) {
    this._chartService = chartService;
    this._colors = config.colors;
    this._userService = userService;
    this._guildService = guildService;
  }

  public readonly data = <SlashCommandBuilder>new SlashCommandBuilder()
    .setName('chart')
    .setDescription('Chart command')
    .addSubcommand(subcommand =>
      subcommand
        .setName('weekly')
        .setDescription('Get a chart of your activities for the last week')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('monthly')
        .setDescription('Get a chart of your activities for the last month')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('yearly')
        .setDescription('Get a chart of your activities for the last year')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('custom')
        .setDescription('Get a chart of your activities for a custom time span')
        .addStringOption(option =>
          option
            .setName('beginning')
            .setDescription('Beginning date')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('end').setDescription('End date').setRequired(true)
        )
    );

  public async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const maxBuckets = 20;
    const span = interaction.options.getSubcommand(true);
    const beginningDate = new Date();
    const endDate = new Date();
    let nBuckets = 7;

    if (span === 'custom') {
      const beginningString = interaction.options.getString('beginning', true);
      const endString = interaction.options.getString('end', true);

      const [parsedBeginningDate, parsedEndDate] = await Promise.all(
        [beginningString, endString].map(str =>
          parseTimeWithUserTimezone(
            this._userService,
            this._guildService,
            str,
            interaction.user.id,
            interaction.guildId
          )
        )
      );

      if (!parsedBeginningDate) {
        await interaction.editReply({
          content: `Invalid beginning date: ${beginningString}`,
        });
        return;
      }

      if (!parsedEndDate) {
        await interaction.editReply({
          content: `Invalid end date: ${endString}`,
        });
        return;
      }

      const actualBeginningDate =
        parsedBeginningDate.getTime() > parsedEndDate.getTime()
          ? parsedEndDate
          : parsedBeginningDate;

      const actualEndDate =
        parsedBeginningDate.getTime() > parsedEndDate.getTime()
          ? parsedBeginningDate
          : parsedEndDate;

      // Don't allow more than 100 years in the past
      const hundredYearsAgo = new Date();
      hundredYearsAgo.setFullYear(hundredYearsAgo.getFullYear() - 100);
      if (actualBeginningDate.getTime() < hundredYearsAgo.getTime()) {
        await interaction.editReply({
          content: 'Beginning date cannot be more than 100 years in the past',
        });
        return;
      }

      // Don't allow graphing the future
      if (actualEndDate.getTime() > new Date().getTime()) {
        await interaction.editReply({
          content: 'Beginning date cannot be in the future',
        });
        return;
      }

      beginningDate.setTime(actualBeginningDate.getTime());
      endDate.setTime(actualEndDate.getTime());
    } else if (span === 'weekly') {
      beginningDate.setDate(beginningDate.getDate() - 7);
    } else if (span === 'monthly') {
      beginningDate.setMonth(beginningDate.getMonth() - 1);
      nBuckets = 30;
    } else if (span === 'yearly') {
      beginningDate.setFullYear(beginningDate.getFullYear() - 1);
      nBuckets = 12;
    }

    const timeDeltaDays = calculateDeltaInDays(endDate, beginningDate);

    // calculate the number of buckets based on the time delta
    if (span === 'custom') {
      if (timeDeltaDays > 365) {
        nBuckets = maxBuckets;
      } else if (timeDeltaDays > 30) {
        nBuckets = Math.round(timeDeltaDays / 30);
      } else {
        nBuckets = timeDeltaDays;
      }

      nBuckets = Math.max(Math.min(nBuckets, maxBuckets), 1);
    }

    // Get activities from the last week and group by day
    const activities = await Activity.aggregate([
      {
        $match: {
          userId: interaction.user.id,
          date: {
            $gte: beginningDate,
            $lte: endDate,
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$date',
            },
          },
          count: {
            $sum: '$duration',
          },
        },
      },
      {
        $sort: {
          _id: 1,
        },
      },
    ]);

    const beginningString = beginningDate.toISOString().slice(0, 10);
    const endString = endDate.toISOString().slice(0, 10);

    if (!activities.find(a => a._id === beginningString)) {
      activities.unshift({
        _id: beginningString,
        count: 0,
      });
    }

    if (!activities.find(a => a._id === endString)) {
      activities.push({
        _id: endString,
        count: 0,
      });
    }

    const chart = await this._chartService.getDateBarChartPng(
      activities.map(a => ({x: a._id, y: a.count})),
      this._colors.secondary,
      nBuckets
    );

    const maxIndex = activities.reduce((acc, curr, index) => {
      return curr.count > activities[acc].count ? index : acc;
    }, 0);

    const averageTime = Math.round(
      activities.reduce((a, b) => a + b.count, 0) / timeDeltaDays
    );
    const totalTime = activities.reduce((a, b) => a + b.count, 0);
    const peakTime = activities[maxIndex].count;
    const peakDay = activities[maxIndex]._id;

    const roundedPeakTime = Math.round(peakTime);
    const roundedAverageTime = Math.round(averageTime);
    const roundedTotalTime = Math.round(totalTime);

    const attachment = new AttachmentBuilder(chart).setName('chart.png');

    const spanTitle = span.charAt(0).toUpperCase() + span.slice(1);
    const spanNoun =
      span === 'custom'
        ? `${timeDeltaDays.toPrecision(2)} days`
        : span === 'yearly'
        ? 'year'
        : span === 'monthly'
        ? 'month'
        : 'week';
    const bucketDescription =
      span === 'custom'
        ? `${(timeDeltaDays / nBuckets).toPrecision(2)} days`
        : span === 'yearly'
        ? 'one month'
        : 'one day';
    const embed = new EmbedBuilder()
      .setTitle(`${spanTitle} Logged Time`)
      .setDescription(
        `Below is a chart of your logged time for the last ${spanNoun} along with some statistics!`
      )
      .setFields(
        {
          name: 'Total Time',
          value: `${roundedTotalTime} minutes`,
        },
        {
          name: 'Average Time',
          value: `${roundedAverageTime} minutes`,
        },
        {
          name: 'Peak Time',
          value: `${roundedPeakTime} minutes on ${peakDay}`,
        }
      )
      .setImage('attachment://chart.png')
      .setColor(this._colors.primary)
      .setFooter({text: `Each bar represents ${bucketDescription}.`});

    await interaction.editReply({
      embeds: [embed],
      files: [attachment],
    });
  }
}
