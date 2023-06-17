import {ICommand} from '.';
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AttachmentBuilder,
} from 'discord.js';
import {injectable} from 'inversify';
import {Activity, IActivity} from '../models/activity';

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
    const exportableActivity = {
      type: activity.type,
      duration: activity.duration,
      url: activity.url,
      name: activity.name,
      date: activity.date,
    };

    exportableActivity.url = exportableActivity.url
      ? encodeURI(exportableActivity.url)
      : undefined;

    switch (format) {
      case 'json':
        return JSON.stringify(exportableActivity);
      case 'csv':
        return `${exportableActivity.date.toISOString()};${
          exportableActivity.type
        };${exportableActivity.duration};${
          exportableActivity.url ? exportableActivity.url : ''
        };${exportableActivity.name}`;
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
    });

    const fileContent = activities
      .map(ExportCommand._getLine.bind(null, format))
      .join('\n');
    const fileBuffer = Buffer.from(fileContent, 'utf8');
    const attachment = new AttachmentBuilder(fileBuffer).setName(
      `export.${format}`
    );

    await interaction.reply({
      files: [attachment],
    });
  }
}
