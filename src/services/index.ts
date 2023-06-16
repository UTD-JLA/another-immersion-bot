import {Container} from 'inversify';
import {IAutocompletionService} from '../services/interfaces';
import AutocompletionService from '../services/impl/autocomplete';

export function registerServices(container: Container) {
  container
    .bind<IAutocompletionService>('AutocompletionService')
    .to(AutocompletionService);
}

export {IAutocompletionService, AutocompletionService};
