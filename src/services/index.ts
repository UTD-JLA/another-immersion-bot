import {Container} from 'inversify';
import {
  IAutocompletionService,
  IMaterialSourceService,
  ILoggerService,
  IChartService,
} from '../services/interfaces';
import AutocompletionService from '../services/impl/autocomplete';
import MaterialSourceService from '../services/impl/materialSource';
import LoggerService from '../services/impl/logger';
import ChartService from '../services/impl/chart';

export function registerServices(container: Container) {
  container
    .bind<IAutocompletionService>('AutocompletionService')
    .to(AutocompletionService);

  container.bind<IChartService>('ChartService').to(ChartService);

  container
    .bind<IMaterialSourceService>('MaterialSourceService')
    .to(MaterialSourceService);

  container.bind<ILoggerService>('LoggerService').toDynamicValue(ctx => {
    const target = ctx.currentRequest.target.name;
    return new LoggerService(
      ctx.container.get('Config'),
      typeof target === 'string' ? {target} : {}
    );
  });
}

export {
  IAutocompletionService,
  IMaterialSourceService,
  ILoggerService,
  IChartService,
};
