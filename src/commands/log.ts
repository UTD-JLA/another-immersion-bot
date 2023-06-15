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
        .setDescription('Date of the activity')
        .setDescriptionLocalization('ja', JA.log.options.date.description)
        .setRequired(false)
    );

  public async execute(interaction: ChatInputCommandInteraction) {
    const type = interaction.options.getString('type', true);
    const duration = interaction.options.getNumber('duration', true);
    const name = interaction.options.getString('name', true);
    const url = interaction.options.getString('url', false);
    const dateString = interaction.options.getString('date', false);
    const date = dateString ? new Date(dateString) : new Date();

    await interaction.deferReply({
      ephemeral: true,
    });

    await Activity.create({
      userId: interaction.user.id,
      type,
      duration,
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
