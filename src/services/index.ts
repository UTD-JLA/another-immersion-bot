import {Container} from 'inversify';
import {
  IAutocompletionService,
  IMaterialSourceService,
  ILoggerService,
  IChartService,
  ILocalizationService,
} from '../services/interfaces';
import AutocompletionService from '../services/impl/autocomplete';
import MaterialSourceService from '../services/impl/materialSource';
import LoggerService from '../services/impl/logger';
import ChartService from '../services/impl/chart';
import LocalizationService from '../services/impl/localization';

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
}

export {
  IAutocompletionService,
  IMaterialSourceService,
  ILoggerService,
  IChartService,
  ILocalizationService,
};
