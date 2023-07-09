import {
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
  IGuildConfigService,
  IUserConfigService,
} from '../services';
import {inject, injectable} from 'inversify';
import {spawn} from 'child_process';
import {LimitedResourceLock} from '../util/limitedResource';
import {cpus} from 'os';
import {IColorConfig, IConfig} from '../config';
import {getUserTimezone, parseTimeWithUserTimezone} from '../util/time';
import {getCommandBuilder} from './log.data';

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
  private readonly _colors: IColorConfig;
  private readonly _guildConfigService: IGuildConfigService;
  private readonly _userConfigService: IUserConfigService;

  // TODO: make configurable
  private readonly _subprocessLock = new LimitedResourceLock(
    cpus().length * 10
  );

  private static readonly KNOWN_HOST_TAGS = new Map<string, string>([
    ['youtube.com', 'youtube'],
    ['youtu.be', 'youtube'],
  ]);

  private static readonly BASE_READING_SPEED = 200; // words per minute

  constructor(
    @inject('AutocompletionService')
    autocompleteService: IAutocompletionService,
    @inject('LoggerService') loggerService: ILoggerService,
    @inject('LocalizationService') localizationService: ILocalizationService,
    @inject('GuildConfigService') guildConfigService: IGuildConfigService,
    @inject('UserConfigService') userConfigService: IUserConfigService,
    @inject('Config') config: IConfig
  ) {
    this._autocompleteService = autocompleteService;
    this._loggerService = loggerService;
    this._localizationService = localizationService;
    this._colors = config.colors;
    this._guildConfigService = guildConfigService;
    this._userConfigService = userConfigService;
  }

  // TODO: anime, vn, etc. shortcuts
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

    try {
      // TODO: also make this configurable
      // NOTE: Discord API gives us 15 minutes to edit the reply
      // This is in milliseconds
      await this._subprocessLock.acquire(1 * 60 * 1000);
    } catch (error) {
      await interaction.editReply({
        content: "I'm busy right now, please try again later",
      });
      // Timout does not release it automatically
      this._subprocessLock.release();
      // IMPORTANT: do not continue unless we have the lock
      return;
    }

    // Attempt to call yt-dlp to extract info about the user-specified url
    let vidInfo: VideoURLExtractedInfo;
    try {
      vidInfo = await this._extractVideoInfo(urlComponents);
    } catch (error) {
      await interaction.editReply({
        content: 'Invalid or unsupported URL',
      });
      return;
    } finally {
      this._subprocessLock.release();
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

    const activity = await Activity.create({
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
      type: 'listening',
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
      .setFooter({text: `ID: ${activity.id}`})
      .setImage(vidInfo.thumbnail)
      .setTimestamp(activity.date)
      .setColor(this._colors.success);

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

    const activity = await Activity.create({
      name,
      duration,
      tags,
      userId: interaction.user.id,
      date,
      type: 'listening',
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
      .setFooter({text: `ID: ${activity.id}`})
      .setTimestamp(activity.date)
      .setColor(this._colors.success);

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
    const charPerMinute =
      interaction.options.getNumber('reading-speed', false) ??
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

    const activity = await Activity.create({
      name,
      duration,
      tags,
      userId: interaction.user.id,
      date,
      type: 'reading',
    });

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
      .setFooter({text: `ID: ${activity.id}`})
      .setTimestamp(activity.date)
      .setColor(this._colors.success);

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

    let pagesPerMinutePromise: Promise<number>;
    let durationPromise: Promise<number>;

    if (!duration) {
      const charsPerMinutePromise = this._userConfigService
        .getReadingSpeed(interaction.user.id)
        .then(speed => speed ?? LogCommand.BASE_READING_SPEED);

      pagesPerMinutePromise = charsPerMinutePromise.then(charsPerMinute => {
        const charsPerPage = 125;
        // Inferred from reading speed
        return charsPerMinute / charsPerPage;
      });

      durationPromise = pagesPerMinutePromise.then(
        pagesPerMinute => pages / pagesPerMinute
      );
    } else {
      pagesPerMinutePromise = Promise.resolve(pages / duration);
      durationPromise = Promise.resolve(duration);
    }

    const [name, pagesPerMinute, finalDuration] = await Promise.all([
      namePromise,
      pagesPerMinutePromise,
      durationPromise,
    ]);

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

    const activity = await Activity.create({
      name,
      duration: finalDuration,
      tags,
      userId: interaction.user.id,
      date,
      type: 'reading',
    });

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
          value: pagesPerMinute.toString(),
        }
      )
      .setFooter({text: `ID: ${activity.id}`})
      .setTimestamp(activity.date)
      .setColor(this._colors.success);

    if (!duration) {
      embed.setDescription(
        'Duration was not provided, so it was inferred from your reading speed.' +
          ' If you want to provide a duration, use the `duration` option.'
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
      .setTimestamp(activity.date)
      .setColor(this._colors.success);

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
