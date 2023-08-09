import {getTimezones} from './time';

const validTimezones = new Set(getTimezones());

export function validateTimezone(timeZone: string) {
  return validTimezones.has(timeZone);
}
