export function formatString(
  format: string,
  kwargs: Record<string, string>
): string {
  let result = format;
  for (const key in kwargs) {
    result = result.replace(new RegExp(`{${key}}`, 'g'), kwargs[key]);
  }
  return result;
}
