import {ICommand} from '.';
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import {injectable, inject} from 'inversify';
import {AttachmentBuilder} from 'discord.js';
import {IConfig, IColorConfig} from '../config';
import {IUserConfigService, IGuildConfigService} from '../services';
import {
  parseTimeWithUserTimezone,
  calculateDeltaInDays,
  getUserTimezone,
} from '../util/time';
import {
  IActivityService,
  ILocalizationService,
  ILoggerService,
} from '../services/interfaces';
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
  private readonly _logger: ILoggerService;
  private readonly _url: URL;
  private readonly _useQuickChart: boolean;

  constructor(
    @inject('Config') config: IConfig,
    @inject('UserConfigService') userService: IUserConfigService,
    @inject('GuildConfigService') guildService: IGuildConfigService,
    @inject('ActivityService') activityService: IActivityService,
    @inject('LocalizationService') localizationService: ILocalizationService,
    @inject('LoggerService') loggerService: ILoggerService
  ) {
    this._url = new URL(
      config.useQuickChart ? config.quickChartUrl : config.chartServiceUrl
    );
    this._useQuickChart = config.useQuickChart;
    this._colors = config.colors;
    this._userService = userService;
    this._guildService = guildService;
    this._activityService = activityService;
    this._localizationService = localizationService;
    this._logger = loggerService;
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

  private async _getQuickChartPng(
    dates: string[],
    values: number[],
    goal: number
  ): Promise<Stream> {
    return new Promise<Stream>((resolve, reject) => {
      const req = httpsRequest(
        {
          hostname: this._url.hostname,
          path: '/chart',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        },
        res => {
          if (res.statusCode !== 200) {
            this._logger.error(`Chart service returned ${res.statusCode}`);
            reject(new Error(`Chart service returned ${res.statusCode}`));
            return;
          }

          resolve(res);
        }
      );

      req.on('error', reject);
      req.write(
        JSON.stringify({
          version: '2',
          backgroundColor: '#232428',
          width: 500,
          height: 300,
          devicePixelRatio: 1.0,
          format: 'png',
          chart: {
            type: 'bar',
            data: {
              labels: dates,
              datasets: [
                {
                  data: values,
                  backgroundColor: this._colors.secondary,
                },
              ],
            },
            options: {
              legend: {
                display: false,
              },
              layout: {
                padding: {
                  left: 10,
                  right: 10,
                  top: 30,
                  bottom: 30,
                },
              },
              scales: {
                xAxes: [
                  {
                    ticks: {
                      fontColor: '#9e9e9e',
                    },
                    gridLines: {
                      display: false,
                    },
                  },
                ],
                yAxes: [
                  {
                    ticks: {
                      fontColor: '#9e9e9e',
                    },
                    gridLines: {
                      color: '#2B2D31',
                      zeroLineColor: '#9e9e9e',
                    },
                  },
                ],
              },
              annotation: {
                annotations: [
                  {
                    type: 'line',
                    mode: 'horizontal',
                    value: goal,
                    scaleID: 'y-axis-0',
                    borderColor: this._colors.primary,
                    borderWidth: 1,
                    borderDash: [5, 5],
                  },
                ],
              },
            },
          },
        })
      );
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

      // Don't allow deltas of over 5 years
      if (calculateDeltaInDays(actualEndDate, actualBeginningDate) > 365 * 5) {
        await interaction.editReply({
          content: i18n.mustLocalize(
            'invalid-date-range',
            'Date range must be less than 5 years'
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

    const timezone = await getUserTimezone(
      this._userService,
      this._guildService,
      interaction.user.id,
      interaction.guildId
    );

    const activities = await this._activityService.getDailyDurationsInDateRange(
      interaction.user.id,
      beginningDate,
      endDate,
      timezone
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

    const dailyGoal = await this._userService.getDailyGoal(interaction.user.id);
    const daysPerBar = Math.ceil(
      calculateDeltaInDays(endDate, beginningDate) / x.length
    );
    const goalPerBar = (dailyGoal ?? 0) * daysPerBar;
    const chart = await this._getQuickChartPng(x, y, goalPerBar);

    const maxIndex = y.reduce((acc, curr, index) => {
      return curr > y[acc] ? index : acc;
    }, 0);

    const averageTime = Math.round(
      y.reduce((a, b) => a + b, 0) / customRangeDelta
    );

    const totalTime = y.reduce((a, b) => a + b, 0);
    const peakTime = y[maxIndex];
    const peakDay = x[maxIndex];
    const roundedPeakTime = Math.round(peakTime);
    const roundedAverageTime = Math.round(averageTime);
    const roundedTotalTime = Math.round(totalTime);
    const goalTotalTime = goalPerBar * x.length;
    const totalGoalRatio = totalTime / goalTotalTime;

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
            `Below is a chart of your logged time for the last ${customRangeDelta.toPrecision(
              2
            )} days along with some statistics!`,
            customRangeDelta.toPrecision(2)
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

    // if significantDatePart is 7, we are grouping by month, else by day
    const embedFooter =
      significantDatePart === 7
        ? i18n.mustLocalize(
            'yearly-span-footer',
            'Each bar represents one month.'
          )
        : i18n.mustLocalize(
            'monthly-span-footer',
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
        },
        {
          name: i18n.mustLocalize('goal-reached', 'Goal Reached'),
          value: `${(totalGoalRatio * 100).toFixed(
            1
          )}% (${roundedTotalTime} / ${Math.round(goalTotalTime)})`,
        }
      )
      .setImage('attachment://chart.png')
      .setColor(this._colors.primary)
      .setFooter({text: embedFooter});

    await interaction.editReply({
      embeds: [embed],
      files: [attachment],
    });
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

    const timezone = await getUserTimezone(
      this._userService,
      this._guildService,
      interaction.user.id,
      interaction.guildId
    );

    const activitiesPromise = this._activityService
      .getDailyDurationsInDateRange(
        interaction.user.id,
        beginningDate,
        endDate,
        timezone
      )
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

    await interaction.editReply({
      embeds: [embed],
      files: [attachment],
    });
  }
}
