import {readFileSync} from 'fs';
import {join} from 'path';

let version: string | undefined;

if (!version) {
  if (process.env.npm_package_version) {
    // if this is running from script, use the version from env
    version = process.env.npm_package_version;
  } else if (process.pkg) {
    // if this is a packaged app, read from the `version.txt` file
    version = readFileSync(
      join(process.execPath, '../VERSION.txt'),
      'utf8'
    ).trim();
  } else {
    // we are running from source, so use the version from package.json
    version = require('../../package.json').version;
  }
}

export const VERSION = version as string;
