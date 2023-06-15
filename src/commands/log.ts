import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from 'discord.js';
import {ICommand} from '.';
import {Activity} from '../models/activity';
import {IAutocompletionService} from '../autocomplete';

const JA = require('../locales/ja.json');

export default class LogCommand implements ICommand {
  constructor(private readonly autocompletionService: IAutocompletionService) {}

  public readonly data = <SlashCommandBuilder>new SlashCommandBuilder()
    .setName('log')
    .setNameLocalization('ja', JA.log.name)
    .setDescription('Log an activity')
    .setDescriptionLocalization('ja', JA.log.description)
    .addStringOption(option =>
      option
        .setName('type')
        .setNameLocalization('ja', JA.log.options.type.name)
        .setDescription('Type of the activity')
        .setDescriptionLocalization('ja', JA.log.options.type.description)
        .setRequired(true)
        .addChoices(
          {
            name: 'Listening',
            value: 'listening',
            name_localizations: {
              ja: JA.log.options.type.options.listening,
            },
          },
          {
            name: 'Reading',
            value: 'reading',
            name_localizations: {
              ja: JA.log.options.type.options.reading,
            },
          }
        )
    )
    .addNumberOption(option =>
      option
        .setName('duration')
        .setNameLocalization('ja', JA.log.options.duration.name)
        .setDescription('Duration of the activity in minutes')
        .setDescriptionLocalization('ja', JA.log.options.duration.description)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('name')
        .setNameLocalization('ja', JA.log.options.name.name)
        .setDescription('Name of the activity')
        .setDescriptionLocalization('ja', JA.log.options.name.description)
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('url')
        .setNameLocalization('ja', JA.log.options.url.name)
        .setDescription('URL of the activity')
        .setDescriptionLocalization('ja', JA.log.options.url.description)
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('date')
        .setNameLocalization('ja', JA.log.options.date.name)
        .setDescription(
          'Date/time of the activity (ex. "2021-01-01", "13:00", "January 1 2021", "01 Jan 1970 00:00:00 GMT")'
        )
        .setDescriptionLocalization('ja', JA.log.options.date.description)
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('unit')
        .setNameLocalization('ja', JA.log.options.unit.name)
        .setDescription('Unit of the duration')
        .addChoices(
          {
            name: 'Episodes',
            value: 'episode',
            name_localizations: {
              ja: JA.log.options.unit.options.episode,
            },
          },
          {
            name: 'Characters',
            value: 'character',
            name_localizations: {
              ja: JA.log.options.unit.options.character,
            },
          },
          {
            name: 'Minute (default)',
            value: 'minute',
            name_localizations: {
              ja: JA.log.options.unit.options.minute,
            },
          }
        )
        .setRequired(false)
    );

  public static TIME_REGEX = /^(\d{1,2}):(\d{1,2})$/;

  public async execute(interaction: ChatInputCommandInteraction) {
    const type = interaction.options.getString('type', true);
    const duration = interaction.options.getNumber('duration', true);
    const name = interaction.options.getString('name', true);
    const url = interaction.options.getString('url', false);
    const dateString = interaction.options.getString('date', false);
    const unit = interaction.options.getString('unit', false);

    // TODO: Handle timezones (let each server set their default timezone)
    let dateTime = dateString ? Date.parse(dateString) : Date.now();

    if (dateString && isNaN(dateTime)) {
      if (!LogCommand.TIME_REGEX.test(dateString)) {
        await interaction.reply({
          content: 'Invalid date',
          ephemeral: true,
        });
        return;
      }

      const match = LogCommand.TIME_REGEX.exec(dateString);
      const hours = parseInt(match![1]);
      const minutes = parseInt(match![2]);

      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        await interaction.reply({
          content: 'Invalid time',
          ephemeral: true,
        });
        return;
      }

      const now = new Date();
      now.setHours(hours);
      now.setMinutes(minutes);
      now.setSeconds(0);
      dateTime = now.getTime();
    }

    const date = new Date(dateTime);

    await interaction.deferReply({
      ephemeral: true,
    });

    let convertedDuration = duration;

    if (unit === 'episode') {
      convertedDuration *= 24;
    } else if (unit === 'character') {
      // 350 characters per minute
      convertedDuration = Math.round(duration / 350);
    } else if (unit === 'minute') {
      // Do nothing
    }

    await Activity.create({
      userId: interaction.user.id,
      type,
      duration: convertedDuration,
      name,
      url,
      date,
    });

    await interaction.editReply({
      content: 'Activity logged!',
    });
  }

  public async autocomplete(interaction: AutocompleteInteraction) {
    const focusedValue = interaction.options.getFocused(true);

    const results = await this.autocompletionService.getSuggestions(
      focusedValue.value,
      5
    );

    await interaction.respond(
      results.map(result => ({
        name: result,
        value: result,
      }))
    );
  }
}
