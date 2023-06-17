import {Container} from 'inversify';
import {
  IAutocompletionService,
  IMaterialSourceService,
  ILoggerService,
} from '../services/interfaces';
import AutocompletionService from '../services/impl/autocomplete';
import MaterialSourceService from '../services/impl/materialSource';
import LoggerService from '../services/impl/logger';

export function registerServices(container: Container) {
  container
    .bind<IAutocompletionService>('AutocompletionService')
    .to(AutocompletionService);

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

export {IAutocompletionService, IMaterialSourceService, ILoggerService};
