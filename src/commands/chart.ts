import {ICommand} from '.';
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import {injectable, inject} from 'inversify';
import {IChartService} from '../services';
import {AttachmentBuilder} from 'discord.js';
import {IConfig, IColorConfig} from '../config';
import {IUserConfigService, IGuildConfigService} from '../services';
import {parseTimeWithUserTimezone, calculateDeltaInDays} from '../util/time';
import {IActivityService, ILocalizationService} from '../services/interfaces';
import {Stream} from 'stream';
import {request} from 'http';
import {request as httpsRequest} from 'https';

@injectable()
export default class ChartCommand implements ICommand {
  private readonly _colors: IColorConfig;
  private readonly _userService: IUserConfigService;
  private readonly _guildService: IGuildConfigService;
  private readonly _activityService: IActivityService;
  private readonly _localizationService: ILocalizationService;
  private readonly _url: URL;
  private readonly _useQuickChart: boolean;

  constructor(
    @inject('ChartService') chartService: IChartService,
    @inject('Config') config: IConfig,
    @inject('UserConfigService') userService: IUserConfigService,
    @inject('GuildConfigService') guildService: IGuildConfigService,
    @inject('ActivityService') activityService: IActivityService,
    @inject('LocalizationService') localizationService: ILocalizationService
  ) {
    this._url = new URL(config.chartServiceUrl);
    this._useQuickChart = true; //config.useQuickChart;
    this._colors = config.colors;
    this._userService = userService;
    this._guildService = guildService;
    this._activityService = activityService;
    this._localizationService = localizationService;
  }

  public get data() {
    return new SlashCommandBuilder()
      .setName('chart')
      .setNameLocalizations(
        this._localizationService.getAllLocalizations('chart.name')
      )
      .setDescription('Chart command')
      .setDescriptionLocalizations(
        this._localizationService.getAllLocalizations('chart.description')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('weekly')
          .setNameLocalizations(
            this._localizationService.getAllLocalizations('chart.weekly.name')
          )
          .setDescription('Get a chart of your activities for the last week')
          .setDescriptionLocalizations(
            this._localizationService.getAllLocalizations(
              'chart.weekly.description'
            )
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('monthly')
          .setNameLocalizations(
            this._localizationService.getAllLocalizations('chart.monthly.name')
          )
          .setDescription('Get a chart of your activities for the last month')
          .setDescriptionLocalizations(
            this._localizationService.getAllLocalizations(
              'chart.monthly.description'
            )
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('yearly')
          .setNameLocalizations(
            this._localizationService.getAllLocalizations('chart.yearly.name')
          )
          .setDescription('Get a chart of your activities for the last year')
          .setDescriptionLocalizations(
            this._localizationService.getAllLocalizations(
              'chart.yearly.description'
            )
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('custom')
          .setNameLocalizations(
            this._localizationService.getAllLocalizations('chart.custom.name')
          )
          .setDescription(
            'Get a chart of your activities for a custom time span'
          )
          .setDescriptionLocalizations(
            this._localizationService.getAllLocalizations(
              'chart.custom.description'
            )
          )
          .addStringOption(option =>
            option
              .setName('beginning')
              .setNameLocalizations(
                this._localizationService.getAllLocalizations(
                  'chart.custom.beginning.name'
                )
              )
              .setDescription('Beginning date')
              .setDescriptionLocalizations(
                this._localizationService.getAllLocalizations(
                  'chart.custom.beginning.description'
                )
              )
              .setRequired(true)
          )
          .addStringOption(option =>
            option
              .setName('end')
              .setNameLocalizations(
                this._localizationService.getAllLocalizations(
                  'chart.custom.end.name'
                )
              )
              .setDescription('End date')
              .setDescriptionLocalizations(
                this._localizationService.getAllLocalizations(
                  'chart.custom.end.description'
                )
              )
              .setRequired(true)
          )
      ) as SlashCommandBuilder;
  }

  private _getDateBarChartPng(
    data: {
      x: string;
      y: number;
    }[],
    color: string,
    buckets: number,
    horizontal = -1,
    horizontalColor = 'r'
  ): Promise<Stream> {
    const body = JSON.stringify({
      data,
      color,
      buckets,
      horizontal,
      horizontal_color: horizontalColor,
    });

    const labels = data.map(d => d.x);
    const values = data.map(d => d.y);

    console.log(labels);
    console.log(values);

    return new Promise<Stream>((resolve, reject) => {
      const req = request(
        {
          hostname: this._url.hostname,
          port: this._url.port,
          path: '/easyDateBar',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': body.length,
          },
        },
        res => {
          if (res.headers['content-type'] !== 'image/png') {
            reject(
              new Error(`Chart service returned ${res.headers['content-type']}`)
            );
          }

          if (res.statusCode !== 200) {
            reject(new Error(`Chart service returned ${res.statusCode}`));
          }

          resolve(res);
        }
      );

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  // Generate chart using quickchart.io instead of the chart service
  private async _executeQuickChart(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const i18n = this._localizationService.useScope(
      interaction.locale,
      'chart.messages'
    );

    await interaction.deferReply();

    const span = interaction.options.getSubcommand(true);
    const beginningDate = new Date();
    const endDate = new Date();

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
          content: i18n.mustLocalize(
            'invalid-date',
            `Invalid date: ${beginningString}`,
            beginningString
          ),
        });
        return;
      }

      if (!parsedEndDate) {
        await interaction.editReply({
          content: i18n.mustLocalize(
            'invalid-date',
            `Invalid date: ${endString}`,
            endString
          ),
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
          content: i18n.mustLocalize(
            'cannot-be-more-than-n-years-in-the-past',
            'Beginning date cannot be more than 100 years in the past',
            100
          ),
        });
        return;
      }

      // Don't allow graphing the future
      if (actualEndDate.getTime() > new Date().getTime()) {
        await interaction.editReply({
          content: i18n.mustLocalize(
            'cannot-be-in-the-future',
            'End date cannot be in the future'
          ),
        });
        return;
      }

      beginningDate.setTime(actualBeginningDate.getTime());
      endDate.setTime(actualEndDate.getTime());
    } else if (span === 'weekly') {
      beginningDate.setDate(beginningDate.getDate() - 6);
    } else if (span === 'monthly') {
      beginningDate.setDate(beginningDate.getDate() - 30);
    } else if (span === 'yearly') {
      beginningDate.setFullYear(beginningDate.getFullYear() - 1);
    }

    const activities = await this._activityService.getDailyDurationsInDateRange(
      interaction.user.id,
      beginningDate,
      endDate
    );

    const customRangeDelta = Math.ceil(
      calculateDeltaInDays(endDate, beginningDate)
    );

    // if the span is custom, we need to determine the effective span
    // if the span is greater than 90 days, we group by months
    // grouping by months
    const effectiveSpan =
      span === 'custom'
        ? customRangeDelta > 90
          ? 'yearly'
          : customRangeDelta > 30
          ? 'monthly'
          : 'weekly'
        : span;

    // how many chars of the date (YYYY-MM-DD) are significant
    // everyhing except for 'yearly' is YYYY-MM-DD
    const significantDatePart = effectiveSpan === 'yearly' ? 7 : 10;

    const buckets = new Map<string, number>();

    for (const [dateString, minutes] of activities) {
      const date = new Date(dateString);
      const dateKey = date.toISOString().slice(0, significantDatePart);

      if (!buckets.has(dateKey)) {
        buckets.set(dateKey, 0);
      }

      buckets.set(dateKey, buckets.get(dateKey)! + minutes);
    }

    // reindex the bucket keys to include missing dates
    const date = new Date(beginningDate);
    while (date.getTime() <= endDate.getTime()) {
      const dateKey = date.toISOString().slice(0, significantDatePart);

      if (!buckets.has(dateKey)) {
        buckets.set(dateKey, 0);
      }

      // make sure not to jump over a whole month
      // but if we are only indexing by month, there is
      // no need to check every day
      date.setDate(date.getDate() + (significantDatePart === 7 ? 28 : 1));
    }

    const [x, y] = Array.from(buckets.entries())
      .sort(([a], [b]) => (a > b ? 1 : -1))
      .reduce(
        (acc, curr) => {
          acc[0].push(curr[0]);
          acc[1].push(curr[1]);
          return acc;
        },
        [[], []] as [string[], number[]]
      );

    const req = httpsRequest(
      {
        hostname: 'quickchart.io',
        path: '/chart',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      res => {
        if (res.statusCode !== 200) {
          console.log(res.statusCode);
          console.log(res.statusMessage);
          console.log(res.headers);
          return;
        }

        const chunks: Buffer[] = [];

        res.on('data', chunk => {
          chunks.push(chunk);
        });

        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const attachment = new AttachmentBuilder(buffer).setName('chart.png');
          const embed = new EmbedBuilder().setImage('attachment://chart.png');

          interaction.editReply({
            embeds: [embed],
            files: [attachment],
          });
        });
      }
    );

    const dailyGoal = await this._userService.getDailyGoal(interaction.user.id);
    const daysPerBar = Math.ceil(
      calculateDeltaInDays(endDate, beginningDate) / x.length
    );
    const goalPerBar = (dailyGoal ?? 0) * daysPerBar;

    req.on('error', err => {
      console.log(err);
    });

    const data = {
      version: '2',
      backgroundColor: 'transparent',
      width: 500,
      height: 300,
      devicePixelRatio: 1.0,
      format: 'png',
      chart: {
        type: 'bar',
        data: {
          labels: x,
          datasets: [
            {
              data: y,
              backgroundColor: this._colors.secondary,
            },
          ],
        },
        options: {
          legend: {
            display: false,
          },
          scales: {
            xAxes: [
              {
                ticks: {
                  fontColor: '#777',
                },
              },
            ],
            yAxes: [
              {
                ticks: {
                  fontColor: '#777',
                },
              },
            ],
          },
          annotation: {
            annotations: [
              {
                type: 'line',
                mode: 'horizontal',
                value: goalPerBar,
                scaleID: 'y-axis-0',
                borderColor: this._colors.primary,
                borderWidth: 3,
              },
            ],
          },
        },
      },
    };

    req.write(JSON.stringify(data));
    req.end();
  }

  public async execute(interaction: ChatInputCommandInteraction) {
    if (this._useQuickChart) {
      await this._executeQuickChart(interaction);
      return;
    }

    const i18n = this._localizationService.useScope(
      interaction.locale,
      'chart.messages'
    );

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
          content: i18n.mustLocalize(
            'invalid-date',
            `Invalid date: ${beginningString}`,
            beginningString
          ),
        });
        return;
      }

      if (!parsedEndDate) {
        await interaction.editReply({
          content: i18n.mustLocalize(
            'invalid-date',
            `Invalid date: ${endString}`,
            endString
          ),
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

      // Don't allow graphing the future
      if (actualEndDate.getTime() > new Date().getTime()) {
        await interaction.editReply({
          content: i18n.mustLocalize(
            'cannot-be-in-the-future',
            'End date cannot be in the future'
          ),
        });
        return;
      }

      beginningDate.setTime(actualBeginningDate.getTime());
      endDate.setTime(actualEndDate.getTime());
    } else if (span === 'weekly') {
      beginningDate.setDate(beginningDate.getDate() - 6);
      beginningDate.setHours(0, 0, 0, 0);
    } else if (span === 'monthly') {
      beginningDate.setDate(beginningDate.getDate() - 29);
      nBuckets = 30;
    } else if (span === 'yearly') {
      beginningDate.setFullYear(beginningDate.getFullYear() - 1);
      nBuckets = 12;
    }

    const timeDeltaDays = Math.ceil(
      calculateDeltaInDays(endDate, beginningDate)
    );

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

    const activitiesPromise = this._activityService
      .getDailyDurationsInDateRange(interaction.user.id, beginningDate, endDate)
      .then(a =>
        a.map(([dateString, minutes]) => ({
          _id: dateString as string,
          count: minutes,
        }))
      );

    const beginningString = beginningDate.toISOString().slice(0, 10);
    const endString = endDate.toISOString().slice(0, 10);

    const dailyGoalPromise = this._userService.getDailyGoal(
      interaction.user.id
    );

    const daysPerBucket = timeDeltaDays / nBuckets;

    const [activities, bucketGoal] = await Promise.all([
      activitiesPromise,
      dailyGoalPromise.then(dailyGoal => (dailyGoal ?? 0) * daysPerBucket),
    ]);

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

    const chart = await this._getDateBarChartPng(
      activities.map(a => ({x: a._id, y: a.count})),
      this._colors.secondary,
      nBuckets,
      bucketGoal,
      this._colors.primary
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

    const spanTitle =
      span === 'custom'
        ? i18n.mustLocalize('custom-span-title', 'Custom Graph')
        : span === 'yearly'
        ? i18n.mustLocalize('yearly-span-title', 'Yearly Graph')
        : span === 'monthly'
        ? i18n.mustLocalize('monthly-span-title', 'Monthly Graph')
        : i18n.mustLocalize('weekly-span-title', 'Weekly Graph');

    const embedDescription =
      span === 'custom'
        ? i18n.mustLocalize(
            'custom-span-description',
            `Below is a chart of your logged time for the last ${timeDeltaDays.toPrecision(
              2
            )} days along with some statistics!`,
            timeDeltaDays.toPrecision(2)
          )
        : span === 'yearly'
        ? i18n.mustLocalize(
            'yearly-span-description',
            'Below is a chart of your logged time for the last year along with some statistics!'
          )
        : span === 'monthly'
        ? i18n.mustLocalize(
            'monthly-span-description',
            'Below is a chart of your logged time for the last month along with some statistics!'
          )
        : i18n.mustLocalize(
            'weekly-span-description',
            'Below is a chart of your logged time for the last week along with some statistics!'
          );

    const embedFooter =
      span === 'custom'
        ? i18n.mustLocalize(
            'custom-span-footer',
            `Each bar represents ${daysPerBucket.toPrecision(2)} days.`,
            daysPerBucket.toPrecision(2)
          )
        : span === 'yearly'
        ? i18n.mustLocalize(
            'yearly-span-footer',
            'Each bar represents one month.'
          )
        : span === 'monthly'
        ? i18n.mustLocalize(
            'monthly-span-footer',
            'Each bar represents one day.'
          )
        : i18n.mustLocalize(
            'weekly-span-footer',
            'Each bar represents one day.'
          );

    const attachment = new AttachmentBuilder(chart).setName('chart.png');
    const embed = new EmbedBuilder()
      .setTitle(spanTitle)
      .setDescription(embedDescription)
      .setFields(
        {
          name: i18n.mustLocalize('total-minutes', 'Total Minutes'),
          value: i18n.mustLocalize(
            'n-minutes',
            `${roundedTotalTime} minutes`,
            roundedTotalTime
          ),
        },
        {
          name: i18n.mustLocalize('average-time', 'Average Time'),
          value: i18n.mustLocalize(
            'n-minutes',
            `${roundedAverageTime} minutes`,
            roundedAverageTime
          ),
        },
        {
          name: i18n.mustLocalize('peak-time', 'Peak Time'),
          value: i18n.mustLocalize(
            'n-minutes-on-date',
            `${roundedPeakTime} minutes on ${peakDay}`,
            roundedPeakTime,
            peakDay
          ),
        }
      )
      .setImage('attachment://chart.png')
      .setColor(this._colors.primary)
      .setFooter({text: embedFooter});

    const msg = await interaction.editReply({
      embeds: [embed],
      files: [attachment],
    });

    console.log(msg.embeds[0].image?.url);
  }
}
