import {ICommand} from '.';
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AttachmentBuilder,
} from 'discord.js';
import {injectable} from 'inversify';
import {Activity, IActivity} from '../models/activity';
import {stringify} from 'csv-string';

@injectable()
export default class ExportCommand implements ICommand {
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
        return JSON.stringify(activity) + '\n';
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

    const activities = await Activity.find({
      userId: interaction.user.id,
    }).select('-_id -userId -__v');

    const fileContent = activities
      .map(activity => activity.toObject())
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
