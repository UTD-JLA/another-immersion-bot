import {Container} from 'inversify';
import {IConfig} from '../config';
import {
  IAutocompletionService,
  IMaterialSourceService,
  ILoggerService,
  IChartService,
  ILocalizationService,
  IGuildConfigService,
  IUserConfigService,
  IActivityService,
  IUserSpeedService,
} from '../services/interfaces';
import AutocompletionService from './impl/autocomplete';
import MaterialSourceService from './impl/materialSource';
import LoggerService from './impl/logger';
import ChartService from './impl/chart';
import LocalizationService from './impl/localization';
import GuildConfigService from './impl/guildConfig';
import UserConfigService from './impl/userConfig';
import ActivityService from './impl/activity';
import UserSpeedService from './impl/userSpeed';
import MemoryMaterialSourceService from './impl/memoryMaterialSource';

export function registerServices(container: Container) {
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

  container.bind<IChartService>('ChartService').to(ChartService);

  container
    .bind<IMaterialSourceService>('MaterialSourceService')
    .to(
      (<IConfig>container.get('Config')).useFuseAutocompletion
        ? MemoryMaterialSourceService
        : MaterialSourceService
    );

  container
    .bind<ILocalizationService>('LocalizationService')
    .to(LocalizationService);

  container
    .bind<IGuildConfigService>('GuildConfigService')
    .to(GuildConfigService);

  container.bind<IUserConfigService>('UserConfigService').to(UserConfigService);

  container.bind<IActivityService>('ActivityService').to(ActivityService);

  container.bind<IUserSpeedService>('UserSpeedService').to(UserSpeedService);
}

export {
  IAutocompletionService,
  IMaterialSourceService,
  ILoggerService,
  IChartService,
  ILocalizationService,
  IGuildConfigService,
  IUserConfigService,
  IActivityService,
  IUserSpeedService,
};
