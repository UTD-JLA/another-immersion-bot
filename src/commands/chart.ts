import {ICommand} from '.';
import {SlashCommandBuilder, ChatInputCommandInteraction} from 'discord.js';
import {injectable, inject} from 'inversify';
import {IChartService} from '../services';
import {Activity} from '../models/activity';
import {AttachmentBuilder} from 'discord.js';

@injectable()
export default class ChartCommand implements ICommand {
  private readonly _chartService: IChartService;

  constructor(@inject('ChartService') chartService: IChartService) {
    this._chartService = chartService;
  }

  public readonly data = new SlashCommandBuilder()
    .setName('chart')
    .setDescription('Chart command');

  public async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    // Get activities from the last week and group by day
    const activities = await Activity.aggregate([
      {
        $match: {
          userId: interaction.user.id,
          date: {
            $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
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

    // Extract x and y data
    // const xdata = activities.map(a => a._id);
    // const ydata = activities.map(a => a.count);

    // Fill in missing days
    const today = new Date();
    const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const days = [];
    for (let d = lastWeek; d <= today; d.setDate(d.getDate() + 1)) {
      days.push(d.toISOString().slice(0, 10));
    }

    for (const day of days) {
      const activity = activities.find(a => a._id === day);
      if (!activity) {
        activities.push({
          _id: day,
          count: 0,
        });
      }
    }

    // Sort by date
    activities.sort((a, b) => (a._id > b._id ? 1 : -1));

    // Extract x and y data
    const xdata = activities.map(a => a._id.slice(5));
    const ydata = activities.map(a => a.count);

    // Get chart
    const chart = await this._chartService.getChartPng(
      'Weekly Logged Time',
      'Date',
      'Minutes',
      xdata,
      ydata,
      false
    );

    const attachment = new AttachmentBuilder(chart);

    await interaction.editReply({
      files: [attachment],
    });
  }
}
