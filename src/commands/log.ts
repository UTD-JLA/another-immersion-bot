import {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
} from 'discord.js';
import {ICommand} from '.';
import {ActivityType, ActivityUnit, IActivity} from '../models/activity';
import {
  IAutocompletionService,
  ILoggerService,
  ILocalizationService,
  IGuildConfigService,
  IUserConfigService,
} from '../services';
import {inject, injectable} from 'inversify';
import {spawn} from 'child_process';
import {LimitedResourceLock, ReleaseFn} from '../util/limitedResource';
import {cpus} from 'os';
import {IConfig} from '../config';
import {getUserTimezone, parseTimeWithUserTimezone} from '../util/time';
import {getCommandBuilder} from './log.data';
import {IActivityService, IUserSpeedService} from '../services/interfaces';

interface VideoURLExtractedInfo {
  title: string;
  id: string;
  extractor: string;
  uploaderId: string;
  uploaderName: string;
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
  private readonly _guildConfigService: IGuildConfigService;
  private readonly _userConfigService: IUserConfigService;
  private readonly _activityService: IActivityService;
  private readonly _userSpeedService: IUserSpeedService;
  private readonly _config: IConfig;

  // TODO: make configurable
  private readonly _subprocessLock: LimitedResourceLock;

  private static readonly KNOWN_HOST_TAGS = new Map<string, string>([
    ['youtube.com', 'youtube'],
    ['youtu.be', 'youtube'],
  ]);

  private static readonly BASE_READING_SPEED = 200; // words per minute

  private static readonly BASE_CHARS_PER_PAGE = 120; // characters per page (manga)

  constructor(
    @inject('AutocompletionService')
    autocompleteService: IAutocompletionService,
    @inject('ActivityService')
    activityService: IActivityService,
    @inject('LoggerService')
    loggerService: ILoggerService,
    @inject('LocalizationService')
    localizationService: ILocalizationService,
    @inject('GuildConfigService')
    guildConfigService: IGuildConfigService,
    @inject('UserConfigService')
    userConfigService: IUserConfigService,
    @inject('Config') config: IConfig,
    @inject('UserSpeedService') userSpeedService: IUserSpeedService
  ) {
    this._autocompleteService = autocompleteService;
    this._loggerService = loggerService;
    this._localizationService = localizationService;
    this._guildConfigService = guildConfigService;
    this._userConfigService = userConfigService;
    this._activityService = activityService;
    this._userSpeedService = userSpeedService;
    this._config = config;

    this._subprocessLock = new LimitedResourceLock(
      config.maxYtdlProcesses ?? cpus().length * 10
    );
  }

  public get data() {
    return getCommandBuilder(this._localizationService);
  }

  private async _getDomainTags(url: URL): Promise<string[]> {
    const hostname = url.hostname;
    const parts = hostname.split('.');

    if (parts.length < 2) {
      return [hostname];
    }

    const domainName = parts[parts.length - 2];
    const domainTag = LogCommand.KNOWN_HOST_TAGS.get(hostname) ?? domainName;

    // TODO: Maybe try to attempt yt-dlp extraction on all urls
    if (domainTag === 'youtube') {
      return [...(await this._getVideoTags(url)), domainTag];
    }

    return [domainTag];
  }

  private async _getVideoTags(url: URL): Promise<string[]> {
    try {
      const info = await this._extractVideoInfo(url);
      return [info.uploaderName, info.uploaderId];
    } catch (error) {
      return [];
    }
  }

  private _extractVideoInfo(url: URL): Promise<VideoURLExtractedInfo> {
    // Calculate starting at a particular time if the user provides a timed url (assuming the 't' parameter, as in YouTube links)
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
          '{"id":%(id)j,"extractor":%(extractor)j,"title":%(title)j,"uploader_id":%(uploader_id)j,"uploader":%(uploader)j,"duration":%(duration)j,"thumbnail":%(thumbnail)j, "description":%(description)j}',
          url.toString(),
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

        const info: Partial<VideoURLExtractedInfo> = {seekTime};
        try {
          const ytdlInfo = JSON.parse(Buffer.concat(stdout).toString());
          info.title = ytdlInfo.title;
          info.id = ytdlInfo.id;
          info.extractor = ytdlInfo.extractor;
          info.uploaderId = ytdlInfo.uploader_id;
          info.uploaderName = ytdlInfo.uploader;
          info.duration = ytdlInfo.duration;
          info.thumbnail = ytdlInfo.thumbnail;
          info.description = ytdlInfo.description;
        } catch (error) {
          if (error instanceof SyntaxError) {
            this._loggerService.error('Recieved invalid JSON from yt-dlp', {
              ...error,
              stdout: Buffer.concat(stdout).toString(),
              stderr: Buffer.concat(stderr).toString(),
              URL: url,
            });
          }

          return reject(error);
        }

        resolve(info as VideoURLExtractedInfo);
      });
    });
  }

  private async _executeVideo(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    await interaction.deferReply();

    const url = interaction.options.getString('url', true);
    const urlComponents = new URL(url);

    const enteredDate = interaction.options.getString('date', false);
    const date = enteredDate
      ? await parseTimeWithUserTimezone(
          this._userConfigService,
          this._guildConfigService,
          enteredDate,
          interaction.user.id,
          interaction.guildId
        )
      : new Date();

    if (!date) {
      await interaction.editReply({
        content: 'Invalid date',
      });
      return;
    }

    let release: ReleaseFn;

    try {
      const timeToWait =
        this._config.proccessAcquisitionTimeout ?? 1 * 60 * 1000;
      // NOTE: Discord API gives us 15 minutes to edit the reply
      // This is in milliseconds
      release = await this._subprocessLock.acquire(
        Math.min(timeToWait, 14.5 * 60 * 1000)
      );
    } catch (error) {
      await interaction.editReply({
        content: "I'm busy right now, please try again later",
      });
      // IMPORTANT: do not continue unless we have the lock
      return;
    }

    // Attempt to call yt-dlp to extract info about the user-specified url
    let vidInfo: VideoURLExtractedInfo | undefined;
    try {
      vidInfo = await this._extractVideoInfo(urlComponents);
    } catch (error) {
      await interaction.editReply({
        content: 'Invalid or unsupported URL',
      });
    } finally {
      release();
    }

    if (!vidInfo) {
      return;
    }

    const enteredDuration = interaction.options.getNumber('duration', false);

    // time from yt-dlp is in seconds but we want minutes
    const duration =
      enteredDuration ?? (vidInfo.seekTime ?? vidInfo.duration) / 60;

    const timeIsFrom = enteredDuration
      ? 'from entered value'
      : vidInfo.seekTime
      ? 'from url'
      : 'from video length';

    const activity = await this._activityService.createActivity({
      name: vidInfo.title,
      url: urlComponents.toString(),
      duration,
      tags: [
        'video',
        vidInfo.extractor,
        vidInfo.uploaderName,
        vidInfo.uploaderId,
      ],
      userId: interaction.user.id,
      date,
      type: ActivityType.Listening,
    });

    const embed = new EmbedBuilder()
      .setTitle('Activity logged!')
      .setFields(
        {
          name: 'Channel',
          value: vidInfo.uploaderName,
        },
        {
          name: 'Video',
          value: vidInfo.title,
        },
        {
          name: 'Watch Time',
          value: activity.formattedDuration! + ` (${timeIsFrom})`,
        },
        {
          name: 'Auto-Tagged',
          value: activity.tags?.join('\n') ?? 'None',
        }
      )
      .setFooter({text: `ID: ${activity._id}`})
      .setImage(vidInfo.thumbnail)
      .setTimestamp(activity.date)
      .setColor(this._config.colors.success);

    await interaction.editReply({
      embeds: [embed],
    });
  }

  private async _executeAnime(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    await interaction.deferReply();

    const nameOrSuggestion = interaction.options.getString('anime-name', true);
    const name = await this._autocompleteService.resolveSuggestion(
      nameOrSuggestion
    );

    const episode = interaction.options.getNumber('episodes', true);
    const episodeLength =
      interaction.options.getNumber('episode-length', false) ?? 24;

    const enteredDate = interaction.options.getString('date', false);

    const date = enteredDate
      ? await parseTimeWithUserTimezone(
          this._userConfigService,
          this._guildConfigService,
          enteredDate,
          interaction.user.id,
          interaction.guildId
        )
      : new Date();

    if (!date) {
      await interaction.editReply({
        content: 'Invalid date',
      });
      return;
    }

    const duration = episode * episodeLength;
    const tags = ['anime'];

    const activity = await this._activityService.createActivity({
      name,
      duration,
      tags,
      userId: interaction.user.id,
      date,
      type: ActivityType.Listening,
      rawDuration: episode,
      rawDurationUnit: ActivityUnit.Episode,
    });

    const embed = new EmbedBuilder()
      .setTitle('Activity logged!')
      .setFields(
        {
          name: 'Anime',
          value: name,
        },
        {
          name: 'Episodes',
          value: episode.toString(),
        },
        {
          name: 'Episode Length',
          value: `${episodeLength} minutes`,
        },
        {
          name: 'Total Watch Time',
          value: activity.formattedDuration!,
        }
      )
      .setFooter({text: `ID: ${activity._id}`})
      .setTimestamp(activity.date)
      .setColor(this._config.colors.success);

    await interaction.editReply({
      embeds: [embed],
    });
  }

  private async _executeVN(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    await interaction.deferReply();

    const nameOrSuggestion = interaction.options.getString('vn-name', true);
    const name = await this._autocompleteService.resolveSuggestion(
      nameOrSuggestion
    );

    const charCount = interaction.options.getNumber('characters', true);
    const manuallyEnteredReadingSpeed = interaction.options.getNumber(
      'reading-speed',
      false
    );
    const charPerMinute =
      manuallyEnteredReadingSpeed ??
      (await this._userConfigService.getReadingSpeed(interaction.user.id)) ??
      LogCommand.BASE_READING_SPEED;

    const duration = charCount / charPerMinute;

    const enteredDate = interaction.options.getString('date', false);
    const date = enteredDate
      ? await parseTimeWithUserTimezone(
          this._userConfigService,
          this._guildConfigService,
          enteredDate,
          interaction.user.id,
          interaction.guildId
        )
      : new Date();

    if (!date) {
      await interaction.editReply({
        content: 'Invalid date',
      });
      return;
    }

    const tags = ['vn'];

    const newActivity: IActivity = {
      name,
      duration,
      tags,
      userId: interaction.user.id,
      date,
      type: ActivityType.Listening,
      rawDuration: charCount,
      rawDurationUnit: ActivityUnit.Character,
    };

    if (manuallyEnteredReadingSpeed) {
      newActivity.speed = charPerMinute;
    }

    const activity = await this._activityService.createActivity(newActivity);

    const embed = new EmbedBuilder()
      .setTitle('Activity logged!')
      .setFields(
        {
          name: 'VN',
          value: name,
        },
        {
          name: 'Characters',
          value: charCount.toString(),
        },
        {
          name: 'Characters Per Minute',
          value: charPerMinute.toString(),
        },
        {
          name: 'Total Read Time',
          value: activity.formattedDuration!,
        }
      )
      .setFooter({text: `ID: ${activity._id}`})
      .setTimestamp(activity.date)
      .setColor(this._config.colors.success);

    await interaction.editReply({
      embeds: [embed],
    });
  }

  private async _executeManga(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    // Note: should not have X-name format because there is no manga data
    // using non-scoped data is fine for now
    const nameOrSuggestion = interaction.options.getString('name', true);
    const namePromise =
      this._autocompleteService.resolveSuggestion(nameOrSuggestion);

    const pages = interaction.options.getNumber('pages', true);
    const duration = interaction.options.getNumber('duration', false);
    const enteredDate = interaction.options.getString('date', false);

    let pagesPerMinute: number;
    let finalDuration: number;
    let durationSource: string | undefined;
    let charStats:
      | {
          value: number;
          atSpeed: number;
        }
      | undefined;

    if (duration) {
      pagesPerMinute = pages / duration;
      finalDuration = duration;
    } else {
      const pageReadingSpeed =
        await this._userConfigService.getPageReadingSpeed(interaction.user.id);

      if (pageReadingSpeed) {
        pagesPerMinute = pageReadingSpeed;
        finalDuration = pages / pagesPerMinute;
        durationSource = 'your configured page speed';

        const estimatedChars = await this._userSpeedService.convertUnit(
          interaction.user.id,
          ActivityUnit.Page,
          ActivityUnit.Character,
          pages
        );

        if (estimatedChars > 0) {
          const charsPerMinute = await this._userSpeedService.predictSpeed(
            interaction.user.id,
            ActivityUnit.Character
          );

          charStats = {
            value: estimatedChars,
            atSpeed: charsPerMinute,
          };
        }
      } else {
        const charsPerMinute = await this._userConfigService.getReadingSpeed(
          interaction.user.id
        );

        pagesPerMinute =
          (charsPerMinute ?? LogCommand.BASE_READING_SPEED) /
          LogCommand.BASE_CHARS_PER_PAGE;

        finalDuration = pages / pagesPerMinute;
        durationSource = charsPerMinute
          ? `your configured reading speed (assuming ${LogCommand.BASE_CHARS_PER_PAGE} chars/page)`
          : 'the default page speed';
      }
    }

    const name = await namePromise;

    const date = enteredDate
      ? await parseTimeWithUserTimezone(
          this._userConfigService,
          this._guildConfigService,
          enteredDate,
          interaction.user.id,
          interaction.guildId
        )
      : new Date();

    if (!date) {
      await interaction.editReply({
        content: 'Invalid date',
      });
      return;
    }

    const tags = ['manga'];

    const newActivity: IActivity = {
      name,
      duration: finalDuration,
      tags,
      userId: interaction.user.id,
      date,
      type: ActivityType.Reading,
      rawDuration: pages,
      rawDurationUnit: ActivityUnit.Page,
    };

    if (duration) {
      newActivity.speed = pagesPerMinute;
    }

    const activity = await this._activityService.createActivity(newActivity);

    const embed = new EmbedBuilder()
      .setTitle('Activity logged!')
      .setFields(
        {
          name: 'Manga',
          value: name,
        },
        {
          name: 'Pages',
          value: pages.toString(),
        },
        {
          name: 'Total Read Time',
          value: activity.formattedDuration!,
        },
        {
          name: `${duration ? '' : 'Inferred '}Pages Per Minute`,
          value: pagesPerMinute.toPrecision(3).toString(),
        }
      )
      .setFooter({text: `ID: ${activity._id}`})
      .setTimestamp(activity.date)
      .setColor(this._config.colors.success);

    if (charStats) {
      embed.addFields({
        name: 'Estimated Characters',
        value: `${Math.round(charStats.value)} (${Math.round(
          charStats.atSpeed
        )} ecpm)`,
      });
    }

    if (durationSource) {
      embed.setDescription(
        'Duration was not provided, so it was inferred from ' +
          durationSource +
          '. ' +
          'If you want to provide a duration, use the `duration` option.'
      );
    }

    await interaction.editReply({
      embeds: [embed],
    });
  }

  public async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() === 'video') {
      return this._executeVideo(interaction);
    } else if (interaction.options.getSubcommand() === 'anime') {
      return this._executeAnime(interaction);
    } else if (interaction.options.getSubcommand() === 'vn') {
      return this._executeVN(interaction);
    } else if (interaction.options.getSubcommand() === 'manga') {
      return this._executeManga(interaction);
    }

    if (interaction.options.getSubcommand() !== 'manual') {
      throw new Error('Subcommand not implemented');
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

    const date = dateString
      ? await parseTimeWithUserTimezone(
          this._userConfigService,
          this._guildConfigService,
          dateString,
          interaction.user.id,
          interaction.guildId
        )
      : new Date();

    if (!date) {
      await interaction.editReply({
        content: 'Invalid date',
      });
      return;
    }

    const timezone = dateString
      ? await getUserTimezone(
          this._userConfigService,
          this._guildConfigService,
          interaction.user.id,
          interaction.guildId ?? undefined
        )
      : null;

    // Convert durartions to minutes as needed
    let convertedDuration = duration;

    if (unit === 'episode') {
      convertedDuration *= 24;
    } else if (unit === 'character') {
      convertedDuration = Math.round(duration / LogCommand.BASE_READING_SPEED);
    } else if (unit === 'minute') {
      // Do nothing
    }

    const activity = await this._activityService.createActivity({
      userId: interaction.user.id,
      type: type as ActivityType,
      duration: convertedDuration,
      name,
      url: url ?? undefined,
      date,
      tags,
    });

    const embed = new EmbedBuilder()
      .setTitle('Activity logged!')
      .setFooter({text: `ID: ${activity._id}`})
      .setTimestamp(activity.date)
      .setColor(this._config.colors.success);

    if (timezone) {
      embed.setDescription(
        `Note: date was parsed as __${date.toISOString()}__\n` +
          ' **You should see the correct localized time at the bottom of this message.**\n' +
          ` The timezone used was **${timezone}**. Check your user configuration to change this.\n` +
          ' Use /undo to remove this activity if it is incorrect and try again.\n' +
          ' For example: use "yesterday 8pm jst" instead of "yesterday 8pm".' +
          ' Also consider setting your timezone or changing the guild timezone if you are an admin.'
      );
    }

    await interaction.editReply({
      embeds: [embed],
    });
  }

  public async autocomplete(interaction: AutocompleteInteraction) {
    const focusedValue = interaction.options.getFocused(true);
    let scope;

    if (focusedValue.name.indexOf('-') !== -1) {
      scope = focusedValue.name.split('-')[0];
    }

    const results = await this._autocompleteService.getSuggestions(
      focusedValue.value,
      10,
      scope
    );

    await interaction.respond(results);
  }
}
