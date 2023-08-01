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
import {localizeDuration} from '../util/generalLocalization';
import {parse as parseHtml, Node, HTMLElement} from 'node-html-parser';
import {HttpClient} from '../util/httpClient';
import {isJapanese} from 'wanakana';

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

interface WebsiteURLExtractedInfo {
  title: string;
  tags: string[];
  description: string | null;
  img: string | null;
  favicon: string | null;
  jlptLevel?: 1 | 2 | 3 | 4 | 5;
  jlptStats: {
    N1: number;
    N2: number;
    N3: number;
    N4: number;
    N5: number;
  };
  gradeStats: {
    G1: number;
    G2: number;
    G3: number;
    G4: number;
    G5: number;
    G6: number;
    G7: number;
    G8: number;
    G9: number;
    G10: number;
  };
  highestStrokeCountKanji?: string;
  highestGradeLevelKanji?: string;
  highestJlptLevelKanji?: string;
  leastFrequentKanji?: string;
  uniqueKanjiCount: number;
  contentLength: number;
}

type KanjiData = Record<
  string,
  {
    strokes: number;
    grade: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | null;
    jlpt_new: 1 | 2 | 3 | 4 | 5 | null;
    freq: number | null;
  }
>;

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
  private readonly _httpClient: HttpClient;
  private readonly _kanjiData: KanjiData;

  private static readonly KNOWN_HOST_TAGS = new Map<string, string>([
    ['youtube.com', 'youtube'],
    ['youtu.be', 'youtube'],
  ]);

  private static readonly BASE_READING_SPEED = 200; // words per minute

  private static readonly BASE_CHARS_PER_PAGE = 120; // characters per page (manga)

  // private static readonly KANJI_DATA =
  //   require('../../data/kanjidic2-misc.json') as Kanjidic2MiscData;

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

    this._httpClient = new HttpClient();

    this._kanjiData = require(config.materialsPath + '/dictionary/kanji.json');
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

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(linkButton);

    // allow user to redo time with video duration if they used the time param
    // but didn't mean for that to be the duration
    if (!enteredDuration && vidInfo.seekTime) {
      const dontUseTimeParamButton = new ButtonBuilder()
        .setCustomId('dont-use-time-param')
        .setLabel(
          i18n.mustLocalize('dont-use-time-param', 'Don\'t use "t" param')
        )
        .setStyle(ButtonStyle.Primary);

      const useTimeParamAsStartingTimeButton = new ButtonBuilder()
        .setCustomId('use-time-param-as-starting-time')
        .setLabel(
          i18n.mustLocalize(
            'use-time-param-as-starting-time',
            'Use "t" param as starting time'
          )
        )
        .setStyle(ButtonStyle.Primary);

      row.addComponents(
        dontUseTimeParamButton,
        useTimeParamAsStartingTimeButton
      );

      const response = await interaction.editReply({
        embeds: [embed],
        components: [row],
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
        row.setComponents(linkButton);

        await interaction.editReply({
          embeds: [embed],
          components: [row],
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

      row.setComponents(linkButton);

      await interaction.editReply({
        embeds: [embed],
        components: [row],
      });
    } else {
      await interaction.editReply({
        embeds: [embed],
        components: [row],
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

  private async _executeManga(interaction: ChatInputCommandInteraction) {
    const i18n = this._localizationService.useScope(
      interaction.locale,
      'log.manga.messages'
    );

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
        await this._userConfigService.getPageReadingSpeed(interaction.user.id);

      if (pageReadingSpeed) {
        pagesPerMinute = pageReadingSpeed;
        finalDuration = pages / pagesPerMinute;
        durationSource = 'page-speed-config';

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
        durationSource = charsPerMinute ? 'reading-speed-config' : 'default';
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
        content: i18n.mustLocalize('invalid-date', 'Invalid date'),
      });
      return;
    }

    const tags = ['manga'];

    const newActivity: Omit<IActivity, 'id'> = {
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
          name: i18n.mustLocalize('manga-title', 'Manga'),
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

  private _removeNodesRecursively(
    node: Node,
    predicate: (node: Node) => boolean
  ) {
    if (predicate(node)) {
      node.remove();
    } else {
      for (const child of node.childNodes) {
        this._removeNodesRecursively(child, predicate);
      }
    }
  }

  private async _crawlWebsite(url: URL): Promise<WebsiteURLExtractedInfo> {
    const res = await this._httpClient.get(url, {
      // max 8kb for headers
      maxHeaderSize: 8 * 1024,
    });
    const root = await res.text({maxBytes: 1024 * 500}).then(parseHtml);
    const tags = new Set<string>();
    const keywords = root.querySelector('meta[name="keywords"]');
    if (keywords) {
      const content = keywords.getAttribute('content');
      if (content) {
        for (const tag of content.split(',')) {
          tags.add(tag.trim());
        }
      }
    }

    const description =
      root
        .querySelector('meta[property="og:description"]')
        ?.getAttribute('content') ||
      root
        .querySelector('meta[name="twitter:description"]')
        ?.getAttribute('content') ||
      null;

    const title =
      root.querySelector('title')?.text ??
      root.querySelector('h1')?.text ??
      'Untitled';

    const thumbnail =
      root
        .querySelector('meta[property="og:image"]')
        ?.getAttribute('content') ||
      root
        .querySelector('meta[name="twitter:image"]')
        ?.getAttribute('content') ||
      null;

    let favicon =
      root.querySelector('link[rel="icon"]')?.getAttribute('href') ||
      root.querySelector('link[rel="shortcut icon"]')?.getAttribute('href') ||
      null;

    // check if favicon is a relative url
    if (favicon && !/^https?:\/\//.test(favicon)) {
      favicon = new URL(favicon, url).toString();
    }

    const jlptStats: WebsiteURLExtractedInfo['jlptStats'] = {
      N1: 0,
      N2: 0,
      N3: 0,
      N4: 0,
      N5: 0,
    };

    const gradeStats: WebsiteURLExtractedInfo['gradeStats'] = {
      G1: 0,
      G2: 0,
      G3: 0,
      G4: 0,
      G5: 0,
      G6: 0,
      G7: 0,
      G8: 0,
      G9: 0,
      G10: 0,
    };

    let highestStrokeCountKanji;
    let highestGradeLevelKanji;
    let highestJlptLevelKanji;
    let leastFrequentKanji;
    let highestStrokeCount = 0;
    let highestGradeLevel = 0;
    let highestJlptLevel = 6;
    let leastFrequency = 0;
    const kanjiCounts: Record<string, number> = {};

    const main =
      root.querySelector('main') || root.querySelector('body') || root;

    // get all text not inside a script, style, ruby > rt, svg, or aria-hidden="true"
    // or is otherwise not visible
    this._removeNodesRecursively(main, node => {
      // Don't remove text nodes
      if (!(node instanceof HTMLElement)) {
        return false;
      }

      // Ignore nodes that are not visible
      return (
        node.tagName === 'SCRIPT' ||
        node.tagName === 'STYLE' ||
        (node.tagName === 'RT' && node.parentNode?.tagName === 'RUBY') ||
        node.tagName === 'SVG' ||
        node.attributes['aria-hidden'] === 'true'
      );
    });

    const text = main.structuredText;
    let contentLength = 0;

    for (const char of text) {
      const misc = this._kanjiData[char];
      if (isJapanese(char)) {
        contentLength++;
      }
      if (!misc) {
        continue;
      }
      if (misc.jlpt_new && !kanjiCounts[char]) {
        jlptStats[`N${misc.jlpt_new}`]++;

        // for JLPT, lower number = higher level
        if (misc.jlpt_new < highestJlptLevel) {
          highestJlptLevel = misc.jlpt_new;
          highestJlptLevelKanji = char;
        } else if (
          misc.jlpt_new === highestJlptLevel &&
          !highestJlptLevelKanji?.includes(char)
        ) {
          highestJlptLevelKanji += char;
        }
      }

      if (misc.grade && !kanjiCounts[char]) {
        gradeStats[`G${misc.grade}`]++;

        // for grade, higher number = higher level
        if (misc.grade > highestGradeLevel) {
          highestGradeLevel = misc.grade;
          highestGradeLevelKanji = char;
        } else if (
          misc.grade === highestGradeLevel &&
          !highestGradeLevelKanji?.includes(char)
        ) {
          highestGradeLevelKanji += char;
        }
      }

      if (misc.strokes > highestStrokeCount) {
        highestStrokeCount = misc.strokes;
        highestStrokeCountKanji = char;
      }

      if (misc.freq && misc.freq > leastFrequency) {
        leastFrequency = misc.freq;
        leastFrequentKanji = char;
      }

      kanjiCounts[char] = (kanjiCounts[char] ?? 0) + 1;
    }

    const tagsArray = Array.from(tags);
    const uniqueKanjiCount = Object.keys(kanjiCounts).length;

    // find JLPT level that contains 80% of kanji with JLPT level
    let jlptLevel;
    let sum = 0;

    for (const level of [5, 4, 3, 2, 1] as (1 | 2 | 3 | 4 | 5)[]) {
      sum += jlptStats[`N${level}`];
      if (sum / uniqueKanjiCount >= 0.85) {
        jlptLevel = level;
        break;
      }
    }

    return {
      title,
      description,
      tags: tagsArray,
      jlptStats,
      gradeStats,
      highestGradeLevelKanji,
      highestJlptLevelKanji,
      highestStrokeCountKanji,
      img: thumbnail,
      uniqueKanjiCount,
      jlptLevel,
      leastFrequentKanji,
      favicon,
      contentLength,
    };
  }

  private async _executeWebsite(interaction: ChatInputCommandInteraction) {
    const i18n = this._localizationService.useScope(
      interaction.locale,
      'log.website.messages'
    );

    await interaction.deferReply();

    const url = interaction.options.getString('url', true);
    const duration = interaction.options.getNumber('duration', true);
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

    const urlComponents = new URL(url);
    const info = await this._crawlWebsite(urlComponents);

    const activity = await this._activityService.createActivity({
      name: info.title,
      duration,
      tags: info.tags,
      userId: interaction.user.id,
      date,
      type: ActivityType.Reading,
    });

    const fields = [
      {
        name: i18n.mustLocalize('website', 'Website'),
        value: info.title,
      },
      {
        name: i18n.mustLocalize('duration', 'Duration'),
        value: localizeDuration(
          duration,
          interaction.locale,
          this._localizationService
        ),
      },
      {
        name: i18n.mustLocalize('kanji-level', 'Kanji Level'),
        value: info.jlptLevel
          ? `N${info.jlptLevel}`
          : i18n.mustLocalize('jlpt-level-unknown', 'Unknown'),
        inline: true,
      },
      {
        name: i18n.mustLocalize('unique-kanji', 'Unique Kanji'),
        value: info.uniqueKanjiCount.toString(),
        inline: true,
      },
      {
        name: i18n.mustLocalize('total-characters', 'Total Characters'),
        value: info.contentLength.toString(),
        inline: true,
      },
    ];

    if (info.description) {
      // put description after website
      fields.splice(1, 0, {
        name: i18n.mustLocalize('description', 'Description'),
        value: info.description,
      });
    }

    if (info.tags.length > 0) {
      fields.push({
        name: i18n.mustLocalize('tags', 'Tags'),
        value: info.tags.join(', '),
      });
    }

    // show some stats about the website and link to the website
    const embed = new EmbedBuilder()
      .setTitle(i18n.mustLocalize('activity-logged', 'Activity Logged!'))
      .setFields(fields)
      .setFooter({text: `ID: ${activity.id}`})
      .setTimestamp(activity.date)
      .setColor(this._config.colors.success)
      .setImage(info.img)
      .setThumbnail(info.favicon);

    const linkButton = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel(i18n.mustLocalize('link', 'Link'))
      .setURL(url);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(linkButton);

    await interaction.editReply({
      embeds: [embed],
      components: [row],
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
    } else if (interaction.options.getSubcommand() === 'website') {
      return this._executeWebsite(interaction);
    }

    if (interaction.options.getSubcommand() !== 'manual') {
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
        content: i18n.mustLocalize('invalid-date', 'Invalid date'),
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
      .setTitle(i18n.mustLocalize('activity-logged', 'Activity Logged!'))
      .setFooter({text: `ID: ${activity.id}`})
      .setTimestamp(activity.date)
      .setColor(this._config.colors.success);

    if (timezone) {
      const warningMessage = i18n.localize(
        'timezone-warning',
        timezone,
        date.toISOString()
      );

      embed.setDescription(
        warningMessage ??
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
