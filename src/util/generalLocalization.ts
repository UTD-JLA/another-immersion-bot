import {Locale} from 'discord.js';
import {ILocalizationService} from '../services/interfaces';

export function localizeDuration(
  durationMinutes: number,
  locale: Locale,
  localization: ILocalizationService
) {
  const i18n = localization.useScope(locale, 'general');

  const days = Math.floor(durationMinutes / 1440);
  const hours = Math.floor((durationMinutes - days * 1440) / 60);
  const minutes = Math.floor(durationMinutes - days * 1440 - hours * 60);

  if (days > 0) {
    return i18n.mustLocalize(
      'duration-days',
      `${days}d ${hours}h ${minutes}m`,
      days,
      hours,
      minutes
    );
  }

  if (hours > 0) {
    return i18n.mustLocalize(
      'duration-hours',
      `${hours}h ${minutes}m`,
      hours,
      minutes
    );
  }

  return i18n.mustLocalize('duration-minutes', `${minutes}m`, minutes);
}
