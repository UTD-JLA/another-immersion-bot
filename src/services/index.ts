import {Container} from 'inversify';
import {
  IAutocompletionService,
  IMaterialSourceService,
  ILoggerService,
  IChartService,
  ILocalizationService,
  IGuildConfigService,
  IUserConfigService,
  IActivityService,
} from '../services/interfaces';
import AutocompletionService from './impl/autocomplete';
import MaterialSourceService from './impl/materialSource';
import LoggerService from './impl/logger';
import ChartService from './impl/chart';
import LocalizationService from './impl/localization';
import GuildConfigService from './impl/guildConfig';
import UserConfigService from './impl/userConfig';
import ActivityService from './impl/activity';

export function registerServices(container: Container) {
  container
    .bind<IAutocompletionService>('AutocompletionService')
    .to(AutocompletionService);

  container.bind<IChartService>('ChartService').to(ChartService);

  container
    .bind<IMaterialSourceService>('MaterialSourceService')
    .to(MaterialSourceService);

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
    .bind<ILocalizationService>('LocalizationService')
    .to(LocalizationService);

  container
    .bind<IGuildConfigService>('GuildConfigService')
    .to(GuildConfigService);

  container.bind<IUserConfigService>('UserConfigService').to(UserConfigService);

  container.bind<IActivityService>('ActivityService').to(ActivityService);
}

export {
  IAutocompletionService,
  IMaterialSourceService,
  ILoggerService,
  IChartService,
  ILocalizationService,
  IGuildConfigService,
  IUserConfigService,
};
