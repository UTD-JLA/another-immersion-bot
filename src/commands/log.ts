import {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
  Locale,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  ButtonInteraction,
  SlashCommandBuilder,
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
import {parseTimeWithUserTimezone} from '../util/time';
import {getCommandBuilder} from './log.data';
import {IActivityService, IUserSpeedService} from '../services/interfaces';
import {localizeDuration} from '../util/generalLocalization';

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

  private readonly _subprocessLock: LimitedResourceLock;

  private static readonly KNOWN_HOST_TAGS = new Map<string, string>([
    ['youtube.com', 'youtube'],
    ['youtu.be', 'youtube'],
  ]);

  private static readonly BASE_READING_SPEED = 200; // words per minute

  private static readonly BASE_CHARS_PER_PAGE = 120; // characters per page (manga)

  private static readonly BASE_CHARS_PER_BOOK_PAGE = 250; // characters per page (book)

  // Some Discord locale codes are not supported by YouTube
  private static readonly YT_LOCALES = new Map<Locale, string>([
    [Locale.Indonesian, 'id'],
    [Locale.EnglishUS, 'en'],
    [Locale.EnglishGB, 'en-GB'],
    [Locale.Bulgarian, 'bg'],
    [Locale.ChineseCN, 'zh-CN'],
    [Locale.ChineseTW, 'zh-TW'],
    [Locale.Croatian, 'hr'],
    [Locale.Czech, 'cs'],
    [Locale.Danish, 'da'],
    [Locale.Dutch, 'nl'],
    [Locale.Finnish, 'fi'],
    [Locale.French, 'fr'],
    [Locale.German, 'de'],
    [Locale.Greek, 'el'],
    [Locale.Hindi, 'hi'],
    [Locale.Hungarian, 'hu'],
    [Locale.Italian, 'it'],
    [Locale.Japanese, 'ja'],
    [Locale.Korean, 'ko'],
    [Locale.Lithuanian, 'lt'],
    [Locale.Norwegian, 'no'],
    [Locale.Polish, 'pl'],
    [Locale.PortugueseBR, 'pt'],
    [Locale.Romanian, 'ro'],
    [Locale.Russian, 'ru'],
    [Locale.SpanishES, 'es'],
    [Locale.Swedish, 'sv'],
    [Locale.Thai, 'th'],
    [Locale.Turkish, 'tr'],
    [Locale.Ukrainian, 'uk'],
    [Locale.Vietnamese, 'vi'],
  ]);

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

  public get data(): SlashCommandBuilder {
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
      return ['video', info.extractor, info.uploaderName, info.uploaderId];
    } catch (error) {
      return [];
    }
  }

  private _extractVideoInfo(
    url: URL,
    locale?: Locale
  ): Promise<VideoURLExtractedInfo> {
    // Calculate starting at a particular time if the user provides a timed url (assuming the 't' parameter, as in YouTube links)
    const seekTime = url.searchParams.has('t')
      ? parseInt(url.searchParams.get('t')!)
      : undefined;

    // yt-dlp expects the locale to be in the format of 'en-US' instead of 'en'
    const ytLocale = LogCommand.YT_LOCALES.get(locale ?? Locale.EnglishUS);

    const extractorArgs = ytLocale
      ? ['--extractor-args', `youtube:lang=${ytLocale}`]
      : [];

    this._loggerService.debug(`Extracting video info from ${url.toString()}`, {
      extractorArgs,
    });

    return new Promise((resolve, reject) => {
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      const process = spawn(
        'yt-dlp',
        [
          '--no-call-home',
          '--skip-download',
          '--no-playlist',
          ...extractorArgs,
          '--print',
          `
          {
            "id":%(id)j,
            "extractor":%(extractor)j,
            "title":%(title)j,
            "uploader_id":%(uploader_id)j,
            "uploader":%(uploader)j,
            "duration":%(duration)j,
            "thumbnail":%(thumbnail)j,
            "description":%(description)j
          }
          `,
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
    const i18n = this._localizationService.useScope(
      interaction.locale,
      'log.video.messages'
    );

    await interaction.deferReply();

    const url = interaction.options.getString('url', true);
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
        this._config.processAcquisitionTimeout ?? 1 * 60 * 1000;
      // NOTE: Discord API gives us 15 minutes to edit the reply
      // This is in milliseconds
      release = await this._subprocessLock.acquire(
        Math.min(timeToWait, 14.5 * 60 * 1000)
      );
    } catch (error) {
      await interaction.editReply({
        content:
          i18n.localize('busy') ?? "I'm busy right now, please try again later",
      });
      // IMPORTANT: do not continue unless we have the lock
      return;
    }

    // Attempt to call yt-dlp to extract info about the user-specified url
    let vidInfo: VideoURLExtractedInfo | undefined;
    try {
      const urlComponents = new URL(url);
      vidInfo = await this._extractVideoInfo(urlComponents, interaction.locale);
    } catch (error) {
      await interaction.editReply({
        content: i18n.localize('ytdl-fail') ?? 'Failed to get video info',
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
      ? i18n.localize('entered-value') ?? 'entered value'
      : vidInfo.seekTime
      ? i18n.localize('url-time-param') ?? 'time parameter in url'
      : i18n.localize('video-length') ?? 'video length';

    const activity = await this._activityService.createActivity({
      name: vidInfo.title,
      url: url,
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

    const fields = [
      {
        name: i18n.mustLocalize('video-channel', 'Channel'),
        value: vidInfo.uploaderName,
      },
      {
        name: i18n.mustLocalize('video-title', 'Video'),
        value: vidInfo.title,
      },
      {
        name: i18n.mustLocalize('duration', 'Duration'),
        value:
          localizeDuration(
            activity.duration,
            interaction.locale,
            this._localizationService
          ) + ` (${timeIsFrom})`,
      },
      {
        name: i18n.mustLocalize('auto-tagged', 'Auto-tagged'),
        value: activity.tags?.join('\n') ?? 'None',
      },
    ];

    const embed = new EmbedBuilder()
      .setTitle(i18n.mustLocalize('activity-logged', 'Activity Logged!'))
      .setFields(fields)
      .setFooter({text: `ID: ${activity.id}`})
      .setImage(vidInfo.thumbnail)
      .setTimestamp(activity.date)
      .setColor(this._config.colors.success);

    const linkButton = new ButtonBuilder()
      .setLabel(i18n.mustLocalize('video-link', 'Video Link'))
      .setStyle(ButtonStyle.Link)
      .setURL(activity.url!);

    const linkRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      linkButton
    );

    // allow user to redo time with video duration if they used the time param
    // but didn't mean for that to be the duration
    if (!enteredDuration && vidInfo.seekTime) {
      const dontUseTimeParamButton = new ButtonBuilder()
        .setCustomId('dont-use-time-param')
        .setLabel(
          i18n.mustLocalize(
            'dont-use-time-param',
            `Use full duration (${Math.round(vidInfo.duration / 60)} minutes)`,
            Math.round(vidInfo.duration / 60)
          )
        )
        .setStyle(ButtonStyle.Primary);

      const useTimeParamAsStartingTimeButton = new ButtonBuilder()
        .setCustomId('use-time-param-as-starting-time')
        .setLabel(
          i18n.mustLocalize(
            'use-time-param-as-starting-time',
            `Use remaining duration (${Math.round(
              (vidInfo.duration - vidInfo.seekTime) / 60
            )} minutes)`,
            Math.round((vidInfo.duration - vidInfo.seekTime) / 60)
          )
        )
        .setStyle(ButtonStyle.Primary);

      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        dontUseTimeParamButton,
        useTimeParamAsStartingTimeButton
      );

      const response = await interaction.editReply({
        embeds: [embed],
        components: [actionRow, linkRow],
      });

      let buttonInteraction: ButtonInteraction;

      try {
        buttonInteraction = await response.awaitMessageComponent({
          filter: i =>
            (i.customId === 'dont-use-time-param' ||
              i.customId === 'use-time-param-as-starting-time') &&
            i.user.id === interaction.user.id,
          time: 60 * 1000,
          componentType: ComponentType.Button,
        });
      } catch {
        await interaction.editReply({
          embeds: [embed],
          components: [linkRow],
        });
        return;
      }

      await buttonInteraction.deferUpdate();
      await this._activityService.deleteActivityById(activity.id);

      const newDuration =
        buttonInteraction.customId === 'dont-use-time-param'
          ? vidInfo.duration / 60
          : (vidInfo.duration - vidInfo.seekTime) / 60;

      const {id: newId} = await this._activityService.createActivity({
        duration: newDuration,
        name: activity.name,
        tags: activity.tags,
        type: activity.type,
        url: activity.url,
        userId: activity.userId,
        date: activity.date,
      });

      fields[2].value = localizeDuration(
        newDuration,
        interaction.locale,
        this._localizationService
      );

      embed.setFooter({text: `ID: ${newId}`});
      embed.setFields(fields);

      await interaction.editReply({
        embeds: [embed],
        components: [linkRow],
      });
    } else {
      await interaction.editReply({
        embeds: [embed],
        components: [linkRow],
      });
    }
  }

  private async _executeAnime(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const i18n = this._localizationService.useScope(
      interaction.locale,
      'log.anime.messages'
    );

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
        content: i18n.mustLocalize('invalid-date', 'Invalid date'),
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
      .setTitle(i18n.mustLocalize('activity-logged', 'Activity Logged!'))
      .setFields(
        {
          name: i18n.mustLocalize('anime', 'Anime'),
          value: name,
        },
        {
          name: i18n.mustLocalize('episodes', 'Episodes'),
          value: episode.toString(),
        },
        {
          name: i18n.mustLocalize('episode-length', 'Episode Length'),
          value: i18n.mustLocalize(
            'n-minutes',
            `${episodeLength} minutes`,
            episodeLength
          ),
        },
        {
          name: i18n.mustLocalize('duration', 'Duration'),
          value: localizeDuration(
            activity.duration,
            interaction.locale,
            this._localizationService
          ),
        }
      )
      .setFooter({text: `ID: ${activity.id}`})
      .setTimestamp(activity.date)
      .setColor(this._config.colors.success);

    await interaction.editReply({
      embeds: [embed],
    });
  }

  private async _executeVN(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const i18n = this._localizationService.useScope(
      interaction.locale,
      'log.vn.messages'
    );

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
        content: i18n.mustLocalize('invalid-date', 'Invalid date'),
      });
      return;
    }

    const tags = ['vn'];

    const newActivity: Omit<IActivity, 'id'> = {
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
      .setTitle(i18n.mustLocalize('activity-logged', 'Activity Logged!'))
      .setFields(
        {
          name: i18n.mustLocalize('vn', 'Visual Novel'),
          value: name,
        },
        {
          name: i18n.mustLocalize('characters', 'Characters'),
          value: charCount.toString(),
        },
        {
          name: i18n.mustLocalize('chars-per-minute', 'Characters Per Minute'),
          value: charPerMinute.toString(),
        },
        {
          name: i18n.mustLocalize('total-read-time', 'Total Read Time'),
          value: localizeDuration(
            activity.duration,
            interaction.locale,
            this._localizationService
          ),
        }
      )
      .setFooter({text: `ID: ${activity.id}`})
      .setTimestamp(activity.date)
      .setColor(this._config.colors.success);

    await interaction.editReply({
      embeds: [embed],
    });
  }

  private async _executeGenericPaged(
    interaction: ChatInputCommandInteraction,
    options: {
      nameOption: string;
      conversionFactor: number;
      unit: ActivityUnit.BookPage | ActivityUnit.Page;
      primaryTag: string;
    }
  ): Promise<void> {
    const i18n = this._localizationService.useScope(
      interaction.locale,
      `log.${options.primaryTag}.messages`
    );

    await interaction.deferReply();
    // Note: should not have X-name format because there is no manga data
    // using non-scoped data is fine for now
    const nameOrSuggestion = interaction.options.getString(
      options.nameOption,
      true
    );
    const name = await this._autocompleteService.resolveSuggestion(
      nameOrSuggestion
    );
    const pages = interaction.options.getNumber('pages', true);
    const duration = interaction.options.getNumber('duration', false);
    const enteredDate = interaction.options.getString('date', false);

    let pagesPerMinute: number;
    let finalDuration: number;
    let durationSource:
      | 'page-speed-config'
      | 'reading-speed-config'
      | 'default'
      | undefined;
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
        options.unit === ActivityUnit.Page
          ? await this._userConfigService.getPageReadingSpeed(
              interaction.user.id
            )
          : await this._userConfigService.getBookPageReadingSpeed(
              interaction.user.id
            );

      if (pageReadingSpeed) {
        pagesPerMinute = pageReadingSpeed;
        finalDuration = pages / pagesPerMinute;
        durationSource = 'page-speed-config';

        const estimatedChars = await this._userSpeedService.convertUnit(
          interaction.user.id,
          options.unit,
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
          options.conversionFactor;

        finalDuration = pages / pagesPerMinute;
        durationSource = charsPerMinute ? 'reading-speed-config' : 'default';
      }
    }

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
        content: i18n.mustLocalize('invalid-date', 'Invalid date'),
      });
      return;
    }

    const tags = [options.primaryTag];

    const newActivity: Omit<IActivity, 'id'> = {
      name,
      duration: finalDuration,
      tags,
      userId: interaction.user.id,
      date,
      type: ActivityType.Reading,
      rawDuration: pages,
      rawDurationUnit: options.unit,
    };

    if (duration) {
      newActivity.speed = pagesPerMinute;
    }

    const activity = await this._activityService.createActivity(newActivity);

    const inferredPpmMessage = i18n.mustLocalize(
      'inferred-pages-per-minute',
      'Inferred Pages Per Minute'
    );

    const ppmMessage = i18n.mustLocalize(
      'pages-per-minute',
      'Pages Per Minute'
    );

    const embed = new EmbedBuilder()
      .setTitle(i18n.mustLocalize('activity-logged', 'Activity Logged!'))
      .setFields(
        {
          name: i18n.mustLocalize('title', 'Title'),
          value: name,
        },
        {
          name: i18n.mustLocalize('pages', 'Pages'),
          value: pages.toString(),
        },
        {
          name: i18n.mustLocalize('total-read-time', 'Total Read Time'),
          value: localizeDuration(
            activity.duration,
            interaction.locale,
            this._localizationService
          ),
        },
        {
          name: duration ? ppmMessage : inferredPpmMessage,
          value: pagesPerMinute.toPrecision(3).toString(),
        }
      )
      .setFooter({text: `ID: ${activity.id}`})
      .setTimestamp(activity.date)
      .setColor(this._config.colors.success);

    if (charStats) {
      const estimatedCharsMessage = i18n.mustLocalize(
        'estimated-characters',
        'Estimated Characters'
      );

      embed.addFields({
        name: estimatedCharsMessage,
        value: `${Math.round(charStats.value)} (${Math.round(
          charStats.atSpeed
        )} ecpm)`,
      });
    }

    if (durationSource) {
      const localizationKey = `duration-source-${durationSource}`;
      const sourceReadble =
        durationSource === 'default'
          ? 'the default reading speed'
          : durationSource === 'page-speed-config'
          ? 'your page reading speed'
          : 'your reading speed';

      const defaultMessage = `Duration was not provided, so it was inferred from ${sourceReadble}. If you want to provide a duration, use the \`duration\` option.`;

      const durationNotProvidedMessage = i18n.mustLocalize(
        localizationKey,
        defaultMessage
      );

      embed.setDescription(durationNotProvidedMessage);
    }

    await interaction.editReply({
      embeds: [embed],
    });
  }

  private async _executeManga(interaction: ChatInputCommandInteraction) {
    return this._executeGenericPaged(interaction, {
      unit: ActivityUnit.Page,
      conversionFactor: LogCommand.BASE_CHARS_PER_PAGE,
      primaryTag: 'manga',
      nameOption: 'name',
    });
  }

  private async _executeBook(interaction: ChatInputCommandInteraction) {
    return this._executeGenericPaged(interaction, {
      unit: ActivityUnit.BookPage,
      conversionFactor: LogCommand.BASE_CHARS_PER_BOOK_PAGE,
      primaryTag: 'book',
      nameOption: 'name',
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
    } else if (interaction.options.getSubcommand() === 'book') {
      return this._executeBook(interaction);
    } else if (interaction.options.getSubcommand() !== 'manual') {
      throw new Error('Subcommand not implemented');
    }

    const i18n = this._localizationService.useScope(
      interaction.locale,
      'log.manual.messages'
    );

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

    await interaction.deferReply();

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
        content: i18n.mustLocalize('invalid-date', 'Invalid date'),
      });
      return;
    }

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
      .setTitle(i18n.mustLocalize('activity-logged', 'Activity Logged!'))
      .setDescription(activity.name)
      .setFooter({text: `ID: ${activity.id}`})
      .setTimestamp(activity.date)
      .setColor(this._config.colors.success);

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
