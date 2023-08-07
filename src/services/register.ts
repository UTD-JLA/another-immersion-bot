import {Container} from 'inversify';
import {IConfig} from '../config';
import {
  IAutocompletionService,
  IMaterialSourceService,
  ILoggerService,
  ILocalizationService,
  IGuildConfigService,
  IUserConfigService,
  IActivityService,
  IUserSpeedService,
} from './interfaces';
import AutocompletionService from './impl/autocomplete';
import MaterialSourceService from './impl/materialSource';
import LoggerService from './impl/logger';
import LocalizationService from './impl/localization';
import GuildConfigService from './impl/guildConfig';
import UserConfigService from './impl/userConfig';
import ActivityService from './impl/activity';
import UserSpeedService from './impl/userSpeed';
import FuseMaterialSourceService from './impl/fuseMaterialSource';
import FlexsearchMaterialSourceService from './impl/flexsearchMaterialSource';
import SqliteActivityService from './impl/sqliteActivity';
import SqliteGuildConfigService from './impl/sqliteGuildConfig';
import SqliteUserConfig from './impl/sqliteUserConfig';
import SqliteMaterialSourceService from './impl/sqliteMaterialSource';

export function registerServices(container: Container) {
  const config = container.get<IConfig>('Config');

  container
    .bind<ILoggerService>('LoggerService')
    .toDynamicValue(ctx => {
      const serviceIdentifier =
        ctx.currentRequest?.parentRequest?.serviceIdentifier.toString();

      return new LoggerService(ctx.container.get('Config'), {
        serviceIdentifier,
      });
    })
    .inTransientScope();

  container
    .bind<IAutocompletionService>('AutocompletionService')
    .to(AutocompletionService);

  const dbAutocompletion = config.useSqlite
    ? SqliteMaterialSourceService
    : MaterialSourceService;

  container
    .bind<IMaterialSourceService>('MaterialSourceService')
    .to(
      config.useFlexsearchAutocompletion
        ? FlexsearchMaterialSourceService
        : config.useFuseAutocompletion
        ? FuseMaterialSourceService
        : dbAutocompletion
    );

  container
    .bind<ILocalizationService>('LocalizationService')
    .to(LocalizationService);

  container
    .bind<IGuildConfigService>('GuildConfigService')
    .to(config.useSqlite ? SqliteGuildConfigService : GuildConfigService);

  container
    .bind<IUserConfigService>('UserConfigService')
    .to(config.useSqlite ? SqliteUserConfig : UserConfigService);

  container
    .bind<IActivityService>('ActivityService')
    .to(config.useSqlite ? SqliteActivityService : ActivityService);

  container.bind<IUserSpeedService>('UserSpeedService').to(UserSpeedService);
}
