import {Container} from 'inversify';
import {IAutocompletionService, IChartService} from '../services/interfaces';
import AutocompletionService from '../services/impl/autocomplete';
import ChartService from '../services/impl/chart';

export function registerServices(container: Container) {
  container
    .bind<IAutocompletionService>('AutocompletionService')
    .to(AutocompletionService);
  container.bind<IChartService>('ChartService').to(ChartService);
}

export {
  IAutocompletionService,
  AutocompletionService,
  IChartService,
  ChartService,
};
