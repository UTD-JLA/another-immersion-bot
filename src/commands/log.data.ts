import {SlashCommandBuilder} from 'discord.js';
import {ILocalizationService} from '../services';

export const getCommandBuilder = (localizationService: ILocalizationService) =>
  new SlashCommandBuilder()
    .setName('log')
    .setNameLocalizations(localizationService.getAllLocalizations('log.name'))
    .setDescription('Log an activity')
    .setDescriptionLocalizations(
      localizationService.getAllLocalizations('log.description')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('video')
        .setNameLocalizations(
          localizationService.getAllLocalizations('log.video.name')
        )
        .setDescription(
          'Log a video from a yt-dlp supported site, like YouTube or NicoNico'
        )
        .setDescriptionLocalizations(
          localizationService.getAllLocalizations('log.video.description')
        )
        .addStringOption(option =>
          option
            .setName('url')
            .setNameLocalizations(
              localizationService.getAllLocalizations('log.video.url.name')
            )
            .setDescription('URL of the video')
            .setDescriptionLocalizations(
              localizationService.getAllLocalizations(
                'log.video.url.description'
              )
            )
            .setRequired(true)
        )
        .addNumberOption(option =>
          option
            .setName('duration')
            .setNameLocalizations(
              localizationService.getAllLocalizations('log.video.duration.name')
            )
            .setDescription('Duration of the activity in minutes')
            .setDescriptionLocalizations(
              localizationService.getAllLocalizations(
                'log.video.duration.description'
              )
            )
            .setMinValue(0)
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('date')
            .setNameLocalizations(
              localizationService.getAllLocalizations('log.video.date.name')
            )
            .setDescription('Date and or time of the activity')
            .setDescriptionLocalizations(
              localizationService.getAllLocalizations(
                'log.video.date.description'
              )
            )
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('anime')
        .setNameLocalizations(
          localizationService.getAllLocalizations('log.anime.name')
        )
        .setDescription('Log an anime episode')
        .setDescriptionLocalizations(
          localizationService.getAllLocalizations('log.anime.description')
        )
        .addNumberOption(option =>
          option
            .setName('episodes')
            .setNameLocalizations(
              localizationService.getAllLocalizations('log.anime.episodes.name')
            )
            .setDescription('How many episodes')
            .setDescriptionLocalizations(
              localizationService.getAllLocalizations(
                'log.anime.episodes.description'
              )
            )
            .setMinValue(1)
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('anime-name')
            .setNameLocalizations(
              localizationService.getAllLocalizations(
                'log.anime.anime-name.name'
              )
            )
            .setDescription('Name of the anime')
            .setDescriptionLocalizations(
              localizationService.getAllLocalizations(
                'log.anime.anime-name.description'
              )
            )
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addNumberOption(option =>
          option
            .setName('episode-length')
            .setNameLocalizations(
              localizationService.getAllLocalizations(
                'log.anime.episode-length.name'
              )
            )
            .setDescription('Length of each episode in minutes')
            .setDescriptionLocalizations(
              localizationService.getAllLocalizations(
                'log.anime.episode-length.description'
              )
            )
            .setMinValue(0)
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('date')
            .setNameLocalizations(
              localizationService.getAllLocalizations('log.anime.date.name')
            )
            .setDescription('Date and or time of the activity')
            .setDescriptionLocalizations(
              localizationService.getAllLocalizations(
                'log.anime.date.description'
              )
            )
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('vn')
        .setNameLocalizations(
          localizationService.getAllLocalizations('log.vn.name')
        )
        .setDescription('Log a visual novel')
        .setDescriptionLocalizations(
          localizationService.getAllLocalizations('log.vn.description')
        )
        .addNumberOption(option =>
          option
            .setName('characters')
            .setNameLocalizations(
              localizationService.getAllLocalizations('log.vn.characters.name')
            )
            .setDescription('How many characters')
            .setDescriptionLocalizations(
              localizationService.getAllLocalizations(
                'log.vn.characters.description'
              )
            )
            .setMinValue(0)
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('vn-name')
            .setNameLocalizations(
              localizationService.getAllLocalizations('log.vn.vn-name.name')
            )
            .setDescription('Name of the visual novel')
            .setDescriptionLocalizations(
              localizationService.getAllLocalizations(
                'log.vn.vn-name.description'
              )
            )
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addNumberOption(option =>
          option
            .setName('reading-speed')
            .setNameLocalizations(
              localizationService.getAllLocalizations(
                'log.vn.reading-speed.name'
              )
            )
            .setDescription('Reading speed in characters per minute')
            .setDescriptionLocalizations(
              localizationService.getAllLocalizations(
                'log.vn.reading-speed.description'
              )
            )
            .setMinValue(0)
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('date')
            .setNameLocalizations(
              localizationService.getAllLocalizations('log.vn.date.name')
            )
            .setDescription('Date/time of the activity')
            .setDescriptionLocalizations(
              localizationService.getAllLocalizations('log.vn.date.description')
            )
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('manga')
        .setNameLocalizations(
          localizationService.getAllLocalizations('log.manga.name')
        )
        .setDescription('Log a manga chapter')
        .setDescriptionLocalizations(
          localizationService.getAllLocalizations('log.manga.description')
        )
        .addStringOption(option =>
          option
            .setName('name')
            .setNameLocalizations(
              localizationService.getAllLocalizations('log.manga.name.name')
            )
            .setDescription('Name of the manga')
            .setDescriptionLocalizations(
              localizationService.getAllLocalizations(
                'log.manga.name.description'
              )
            )
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addNumberOption(option =>
          option
            .setName('pages')
            .setNameLocalizations(
              localizationService.getAllLocalizations('log.manga.pages.name')
            )
            .setDescription('How many pages')
            .setDescriptionLocalizations(
              localizationService.getAllLocalizations(
                'log.manga.pages.description'
              )
            )
            .setMinValue(0)
            .setRequired(true)
        )
        .addNumberOption(option =>
          option
            .setName('duration')
            .setNameLocalizations(
              localizationService.getAllLocalizations('log.manga.duration.name')
            )
            .setDescription('How long it took to read in minutes')
            .setDescriptionLocalizations(
              localizationService.getAllLocalizations(
                'log.manga.duration.description'
              )
            )
            .setMinValue(0)
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('date')
            .setNameLocalizations(
              localizationService.getAllLocalizations('log.manga.date.name')
            )
            .setDescription('Date/time of the activity')
            .setDescriptionLocalizations(
              localizationService.getAllLocalizations(
                'log.manga.date.description'
              )
            )
            .setRequired(false)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName('manual')
        .setNameLocalizations(
          localizationService.getAllLocalizations('log.manual.name')
        )
        .setDescription('Log an activity manually')
        .setDescriptionLocalizations(
          localizationService.getAllLocalizations('log.manual.description')
        )
        .addStringOption(option =>
          option
            .setName('type')
            .setNameLocalizations(
              localizationService.getAllLocalizations('log.manual.type.name')
            )
            .setDescription('Type of the activity')
            .setDescriptionLocalizations(
              localizationService.getAllLocalizations(
                'log.manual.type.description'
              )
            )
            .setRequired(true)
            .addChoices(
              {
                name: 'Listening',
                value: 'listening',
                name_localizations: localizationService.getAllLocalizations(
                  'log.manual.type.listening.name'
                ),
              },
              {
                name: 'Reading',
                value: 'reading',
                name_localizations: localizationService.getAllLocalizations(
                  'log.manual.type.reading.name'
                ),
              }
            )
        )
        .addNumberOption(option =>
          option
            .setName('duration')
            .setNameLocalizations(
              localizationService.getAllLocalizations(
                'log.manual.duration.name'
              )
            )
            .setDescription('Duration of the activity in minutes')
            .setDescriptionLocalizations(
              localizationService.getAllLocalizations(
                'log.manual.duration.description'
              )
            )
            .setMinValue(0)
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('name')
            .setNameLocalizations(
              localizationService.getAllLocalizations('log.manual.name.name')
            )
            .setDescription('Name of the activity')
            .setDescriptionLocalizations(
              localizationService.getAllLocalizations(
                'log.manual.name.description'
              )
            )
            .setAutocomplete(true)
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('url')
            .setNameLocalizations(
              localizationService.getAllLocalizations('log.manual.url.name')
            )
            .setDescription('URL of the activity')
            .setDescriptionLocalizations(
              localizationService.getAllLocalizations(
                'log.manual.url.description'
              )
            )
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('date')
            .setNameLocalizations(
              localizationService.getAllLocalizations('log.manual.date.name')
            )
            .setDescription(
              'Date/time of the activity (ex. "2021-01-01", "13:00", "January 1 2021", "01 Jan 1970 00:00:00 GMT")'
            )
            .setDescriptionLocalizations(
              localizationService.getAllLocalizations(
                'log.manual.date.description'
              )
            )
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('unit')
            .setNameLocalizations(
              localizationService.getAllLocalizations('log.manual.unit.name')
            )
            .setDescription('Unit of the duration')
            .setDescriptionLocalizations(
              localizationService.getAllLocalizations(
                'log.manual.unit.description'
              )
            )
            .addChoices(
              {
                name: 'Episodes',
                value: 'episode',
                name_localizations: localizationService.getAllLocalizations(
                  'log.manual.unit.episode.name'
                ),
              },
              {
                name: 'Characters',
                value: 'character',
                name_localizations: localizationService.getAllLocalizations(
                  'log.manual.unit.character.name'
                ),
              },
              {
                name: 'Minute (default)',
                value: 'minute',
                name_localizations: localizationService.getAllLocalizations(
                  'log.manual.unit.minute.name'
                ),
              }
            )
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('tags')
            .setNameLocalizations(
              localizationService.getAllLocalizations('log.manual.tags.name')
            )
            .setDescription('Tags for the activity')
            .setDescriptionLocalizations(
              localizationService.getAllLocalizations(
                'log.manual.tags.description'
              )
            )
            .setRequired(false)
        )
    ) as SlashCommandBuilder;
