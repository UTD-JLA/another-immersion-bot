import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
} from 'discord.js';
import {ICommand} from '.';
import {Activity} from '../models/activity';
import {
  IAutocompletionService,
  ILoggerService,
  ILocalizationService,
} from '../services';
import {inject, injectable} from 'inversify';
import {spawn} from 'child_process';
import {LimitedResourceLock} from '../util/limitedResource';
import {cpus} from 'os';

//const JA = require('../locales/ja.json');

interface YouTubeURLExtractedInfo {
  title: string;
  channelId: string;
  channelName: string;
  duration: number;
  seekTime?: number;
  thumbnail: string;
  description: string;
}

@injectable()
export default class LogCommand implements ICommand {
  private readonly _autocompleteService: IAutocompletionService;
  private readonly _loggerService: ILoggerService;
  private readonly _localizationService: ILocalizationService;

  // TODO: make configurable
  private readonly _subprocessLock = new LimitedResourceLock(
    cpus().length * 10
  );

  constructor(
    @inject('AutocompletionService')
    autocompleteService: IAutocompletionService,
    @inject('LoggerService') loggerService: ILoggerService,
    @inject('LocalizationService') localizationService: ILocalizationService
  ) {
    this._autocompleteService = autocompleteService;
    this._loggerService = loggerService;
    this._localizationService = localizationService;
  }

  // TODO: anime, vn, etc. shortcuts
  public get data() {
    return <SlashCommandBuilder>new SlashCommandBuilder()
      .setName('log')
      .setNameLocalizations(
        this._localizationService.getAllLocalizations('log.name')
      )
      .setDescription('Log an activity')
      .setDescriptionLocalizations(
        this._localizationService.getAllLocalizations('log.description')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('youtube')
          .setNameLocalizations(
            this._localizationService.getAllLocalizations('log.youtube.name')
          )
          .setDescription('Log a YouTube video')
          .setDescriptionLocalizations(
            this._localizationService.getAllLocalizations(
              'log.youtube.description'
            )
          )
          .addStringOption(option =>
            option
              .setName('url')
              .setNameLocalizations(
                this._localizationService.getAllLocalizations(
                  'log.youtube.url.name'
                )
              )
              .setDescription('URL of the YouTube video')
              .setDescriptionLocalizations(
                this._localizationService.getAllLocalizations(
                  'log.youtube.url.description'
                )
              )
              .setRequired(true)
          )
          .addNumberOption(option =>
            option
              .setName('duration')
              .setNameLocalizations(
                this._localizationService.getAllLocalizations(
                  'log.youtube.duration.name'
                )
              )
              .setDescription('Duration of the activity in minutes')
              .setDescriptionLocalizations(
                this._localizationService.getAllLocalizations(
                  'log.youtube.duration.description'
                )
              )
              .setRequired(false)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('manual')
          .setNameLocalizations(
            this._localizationService.getAllLocalizations('log.manual.name')
          )
          .setDescription('Log an activity manually')
          .setDescriptionLocalizations(
            this._localizationService.getAllLocalizations(
              'log.manual.description'
            )
          )
          .addStringOption(option =>
            option
              .setName('type')
              .setNameLocalizations(
                this._localizationService.getAllLocalizations(
                  'log.manual.type.name'
                )
              )
              .setDescription('Type of the activity')
              .setDescriptionLocalizations(
                this._localizationService.getAllLocalizations(
                  'log.manual.type.description'
                )
              )
              .setRequired(true)
              .addChoices(
                {
                  name: 'Listening',
                  value: 'listening',
                  name_localizations:
                    this._localizationService.getAllLocalizations(
                      'log.manual.type.listening.name'
                    ),
                },
                {
                  name: 'Reading',
                  value: 'reading',
                  name_localizations:
                    this._localizationService.getAllLocalizations(
                      'log.manual.type.reading.name'
                    ),
                }
              )
          )
          .addNumberOption(option =>
            option
              .setName('duration')
              .setNameLocalizations(
                this._localizationService.getAllLocalizations(
                  'log.manual.duration.name'
                )
              )
              .setDescription('Duration of the activity in minutes')
              .setDescriptionLocalizations(
                this._localizationService.getAllLocalizations(
                  'log.manual.duration.description'
                )
              )
              .setRequired(true)
          )
          .addStringOption(option =>
            option
              .setName('name')
              .setNameLocalizations(
                this._localizationService.getAllLocalizations(
                  'log.manual.name.name'
                )
              )
              .setDescription('Name of the activity')
              .setDescriptionLocalizations(
                this._localizationService.getAllLocalizations(
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
                this._localizationService.getAllLocalizations(
                  'log.manual.url.name'
                )
              )
              .setDescription('URL of the activity')
              .setDescriptionLocalizations(
                this._localizationService.getAllLocalizations(
                  'log.manual.url.description'
                )
              )
              .setRequired(false)
          )
          .addStringOption(option =>
            option
              .setName('date')
              .setNameLocalizations(
                this._localizationService.getAllLocalizations(
                  'log.manual.date.name'
                )
              )
              .setDescription(
                'Date/time of the activity (ex. "2021-01-01", "13:00", "January 1 2021", "01 Jan 1970 00:00:00 GMT")'
              )
              .setDescriptionLocalizations(
                this._localizationService.getAllLocalizations(
                  'log.manual.date.description'
                )
              )
              .setRequired(false)
          )
          .addStringOption(option =>
            option
              .setName('unit')
              .setNameLocalizations(
                this._localizationService.getAllLocalizations(
                  'log.manual.unit.name'
                )
              )
              .setDescription('Unit of the duration')
              .setDescriptionLocalizations(
                this._localizationService.getAllLocalizations(
                  'log.manual.unit.description'
                )
              )
              .addChoices(
                {
                  name: 'Episodes',
                  value: 'episode',
                  name_localizations:
                    this._localizationService.getAllLocalizations(
                      'log.manual.unit.episode.name'
                    ),
                },
                {
                  name: 'Characters',
                  value: 'character',
                  name_localizations:
                    this._localizationService.getAllLocalizations(
                      'log.manual.unit.character.name'
                    ),
                },
                {
                  name: 'Minute (default)',
                  value: 'minute',
                  name_localizations:
                    this._localizationService.getAllLocalizations(
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
                this._localizationService.getAllLocalizations(
                  'log.manual.tags.name'
                )
              )
              .setDescription('Tags for the activity')
              .setDescriptionLocalizations(
                this._localizationService.getAllLocalizations(
                  'log.manual.tags.description'
                )
              )
              .setRequired(false)
          )
      );
  }

  public static TIME_REGEX = /^(\d{1,2}):(\d{1,2})$/;

  public static KNOWN_DOMAIN_TAGS = new Map<string, string>([
    ['youtube.com', 'youtube'],
    ['youtu.be', 'youtube'],
  ]);

  public static get DOMAIN_TAG_VALUES(): Set<string> {
    return new Set(LogCommand.KNOWN_DOMAIN_TAGS.values());
  }

  private async _getDomainTags(url: URL): Promise<string[]> {
    const hostname = url.hostname;
    const parts = hostname.split('.');

    if (parts.length < 2) {
      return [hostname];
    }

    const domainName = parts[parts.length - 2];
    const domainTag =
      LogCommand.KNOWN_DOMAIN_TAGS.get(domainName) ?? domainName;

    if (domainTag === 'youtube') {
      return [...(await this._getYoutubeTags(url)), domainTag];
    }

    return [domainTag];
  }

  private async _getYoutubeTags(url: URL): Promise<string[]> {
    try {
      const info = await this._extractYouTubeInfo(url);
      return [info.channelName, info.channelId];
    } catch (error) {
      return [];
    }
  }

  private _extractYouTubeInfo(url: URL): Promise<YouTubeURLExtractedInfo> {
    const id =
      url.hostname === 'youtu.be'
        ? url.pathname.slice(1)
        : url.searchParams.get('v');

    if (!id) {
      throw new Error('Invalid YouTube URL');
    }

    const seekTime = url.searchParams.has('t')
      ? parseInt(url.searchParams.get('t')!)
      : undefined;

    return new Promise((resolve, reject) => {
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      const process = spawn(
        'yt-dlp',
        [
          '--no-call-home',
          '--skip-download',
          '--print',
          '{"title":%(title)j,"channel_id":%(channel_id)j,"channel":%(channel)j,"duration":%(duration)j,"thumbnail":%(thumbnail)j, "description":%(description)j}',
          id,
        ],
        {shell: false}
      );

      process.stdout.on('data', data => {
        stdout.push(data);
      });

      process.stderr.on('data', data => {
        stderr.push(data);
      });

      process.on('close', code => {
        if (code !== 0) {
          reject(
            new Error(
              `yt-dlp exited with code ${code}: ${Buffer.concat(
                stderr
              ).toString()}`
            )
          );
        }

        const info: Partial<YouTubeURLExtractedInfo> = {seekTime};
        try {
          const ytdlInfo = JSON.parse(Buffer.concat(stdout).toString());
          info.title = ytdlInfo.title;
          info.channelId = ytdlInfo.channel_id;
          info.channelName = ytdlInfo.channel;
          info.duration = ytdlInfo.duration;
          info.thumbnail = ytdlInfo.thumbnail;
          info.description = ytdlInfo.description;
        } catch (error) {
          if (error instanceof SyntaxError) {
            this._loggerService.error('Recieved invalid JSON from yt-dlp', {
              ...error,
              stdout: Buffer.concat(stdout).toString(),
              stderr: Buffer.concat(stderr).toString(),
              videoId: id,
            });
          }

          return reject(error);
        }

        resolve(info as YouTubeURLExtractedInfo);
      });
    });
  }

  private async _executeYoutube(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    await interaction.deferReply();

    const url = interaction.options.getString('url', true);
    const urlComponents = new URL(url);

    try {
      // TODO: also make this configurable
      // NOTE: Discord API gives us 15 minutes to edit the reply
      await this._subprocessLock.acquire(1);
    } catch (error) {
      await interaction.editReply({
        content: "I'm busy right now, please try again later",
      });
      // IMPORTANT: do not continue unless we have the lock
      return;
    }

    let ytInfo: YouTubeURLExtractedInfo;
    try {
      ytInfo = await this._extractYouTubeInfo(urlComponents);
    } catch (error) {
      await interaction.editReply({
        content: 'Invalid YouTube URL',
      });
      return;
    } finally {
      this._subprocessLock.release();
    }

    const enteredDuration = interaction.options.getNumber('duration', false);

    // time from youtube is in seconds but we want minutes
    const duration =
      enteredDuration ?? (ytInfo.seekTime ?? ytInfo.duration) / 60;

    const timeIsFrom = enteredDuration
      ? 'from entered value'
      : ytInfo.seekTime
      ? 'from url'
      : 'from video length';

    const hours = Math.floor(duration / 60);
    const minutes = Math.floor(duration % 60);

    const activity = await Activity.create({
      name: ytInfo.title,
      url: urlComponents.toString(),
      duration,
      tags: ['youtube', ytInfo.channelName, ytInfo.channelId],
      userId: interaction.user.id,
      date: new Date(),
      type: 'listening',
    });

    const embed = new EmbedBuilder()
      .setTitle('Activity logged!')
      .setFields(
        {
          name: 'Channel',
          value: ytInfo.channelName,
        },
        {
          name: 'Video',
          value: ytInfo.title,
        },
        {
          name: 'Watch Time',
          value: `${hours}h ${minutes}m (${timeIsFrom})`,
        },
        {
          name: 'Auto-Tagged',
          value: activity.tags?.join('\n') ?? 'None',
        }
      )
      .setFooter({text: `ID: ${activity.id}`})
      .setImage(ytInfo.thumbnail)
      .setTimestamp(activity.date);

    await interaction.editReply({
      embeds: [embed],
    });
  }

  public async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() === 'youtube') {
      return this._executeYoutube(interaction);
    }

    // manual entry
    const type = interaction.options.getString('type', true);
    const duration = interaction.options.getNumber('duration', true);
    const url = interaction.options.getString('url', false);
    const dateString = interaction.options.getString('date', false);
    const unit = interaction.options.getString('unit', false);

    const nameOrSuggestion = interaction.options.getString('name', true);
    const name = await this._autocompleteService.resolveSuggestion(
      nameOrSuggestion
    );

    const urlComponents = url ? new URL(url) : null;
    const tagString = interaction.options.getString('tags', false);
    const tags = tagString ? tagString.split(',') : [];

    await interaction.deferReply({
      ephemeral: true,
    });

    if (urlComponents) {
      tags.push(...(await this._getDomainTags(urlComponents)));
    }

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

    let convertedDuration = duration;

    if (unit === 'episode') {
      convertedDuration *= 24;
    } else if (unit === 'character') {
      // 350 characters per minute
      convertedDuration = Math.round(duration / 350);
    } else if (unit === 'minute') {
      // Do nothing
    }

    const activity = await Activity.create({
      userId: interaction.user.id,
      type,
      duration: convertedDuration,
      name,
      url,
      date,
      tags,
    });

    const embed = new EmbedBuilder()
      .setTitle('Activity logged!')
      .setFooter({text: `ID: ${activity.id}`})
      .setTimestamp(activity.date);

    await interaction.editReply({
      embeds: [embed],
    });
  }

  public async autocomplete(interaction: AutocompleteInteraction) {
    const focusedValue = interaction.options.getFocused(true);

    const results = await this._autocompleteService.getSuggestions(
      focusedValue.value,
      10
    );

    await interaction.respond(results);
  }
}
