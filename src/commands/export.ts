import {ICommand} from '.';
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AttachmentBuilder,
} from 'discord.js';
import {inject, injectable} from 'inversify';
import {IActivity} from '../models/activity';
import {IActivityService} from '../services/interfaces';
import {stringify} from 'csv-string';

@injectable()
export default class ExportCommand implements ICommand {
  constructor(
    @inject('ActivityService')
    private readonly activityService: IActivityService
  ) {}

  public readonly data = <SlashCommandBuilder>new SlashCommandBuilder()
    .setName('export')
    .setDescription('Export command')
    .addStringOption(option =>
      option
        .setName('format')
        .setDescription('Format to export to')
        .setRequired(true)
        .addChoices(
          {
            name: 'JSON',
            value: 'json',
          },
          {
            name: 'CSV',
            value: 'csv',
          }
        )
    );

  private static _getLine(format: 'json' | 'csv', activity: IActivity): string {
    switch (format) {
      case 'json':
        return (
          JSON.stringify({
            date: activity.date.toISOString(),
            type: activity.type,
            duration: activity.duration,
            name: activity.name,
            url: activity.url,
            tags: activity.tags,
            rawDuration: activity.rawDuration,
            rawDurationUnit: activity.rawDurationUnit,
            speed: activity.speed,
          }) + '\n'
        );
      case 'csv':
        return stringify([
          activity.date.toISOString(),
          activity.type,
          activity.duration,
          activity.name,
          activity.url,
          activity.tags?.join(','),
        ]);
      default:
        throw new Error(`Unknown format ${format}`);
    }
  }

  public async execute(interaction: ChatInputCommandInteraction) {
    const format = interaction.options.getString('format', true) as
      | 'json'
      | 'csv';

    const activities = await this.activityService.getActivities(
      interaction.user.id
    );

    const fileContent = activities
      .map(ExportCommand._getLine.bind(null, format))
      .join('');
    const fileBuffer = Buffer.from(fileContent, 'utf8');
    const attachment = new AttachmentBuilder(fileBuffer).setName(
      `export.${format}`
    );

    await interaction.reply({
      files: [attachment],
    });
  }
}
