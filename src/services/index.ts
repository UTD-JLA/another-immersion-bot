import {Container} from 'inversify';
import {
  IAutocompletionService,
  IMaterialSourceService,
  ILoggerService,
  IChartService,
  ILocalizationService,
  IGuildConfigService,
  IUserConfigService,
} from '../services/interfaces';
import AutocompletionService from '../services/impl/autocomplete';
import MaterialSourceService from '../services/impl/materialSource';
import LoggerService from '../services/impl/logger';
import ChartService from '../services/impl/chart';
import LocalizationService from '../services/impl/localization';
import GuildConfigService from '../services/impl/guildConfig';
import UserConfigService from '../services/impl/userConfig';

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
