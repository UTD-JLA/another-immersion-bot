import 'reflect-metadata';
import {Client, GatewayIntentBits, REST, Routes, Events} from 'discord.js';
import {connect} from 'mongoose';
import {migrate} from 'drizzle-orm/better-sqlite3/migrator';
import {createDb} from './db/drizzle';
import {Config, IConfig, ConfigFields} from './config';
import {onClientReady, onInteractionCreate} from './events';
import commands, {ICommand} from './commands';
import {
  registerServices,
  IMaterialSourceService,
  ILoggerService,
} from './services';
import {Container} from 'inversify';
import {sync as commandExistsSync} from 'command-exists';
import {dirname} from 'path';
import {pullAll} from './pull';

(async function main() {
  if (process.argv.length > 2) {
    if (process.argv[2] === 'help') {
      printHelp();
      return;
    }

    if (process.argv[2] === 'pull') {
      if (process.argv.length < 5) {
        console.error('Missing arguments');
        console.error(
          'Usage: another-immersion-bot pull <mongo-url> <sqlite-path>'
        );
        return;
      }

      await pullAll(process.argv[3], process.argv[4]);
      return;
    }
  }

  await runBot();
})();

function printHelp() {
  console.log('Usage: another-immersion-bot [command]');
  console.log();
  console.log('Available commands:');
  console.log('  help - print this help message');
  console.log('  pull <mongo-url> <sqlite-path> - pull data from MongoDB');
  console.log();
  console.log('Available config variables:');
  ConfigFields.forEach(field => {
    console.log(
      `  ${field.name} - ${field.description} ${
        field.optional ? '(optional)' : ''
      }`
    );
  });
}

async function connectDatabase(
  config: IConfig,
  log?: (msg: string) => void | Promise<void>
) {
  if (config.useSqlite) {
    const db = createDb(config.dbPath);

    log?.('Migrating database');
    migrate(db, {
      migrationsFolder: process.pkg
        ? dirname(process.execPath) + '/migrations'
        : __dirname + '/../migrations',
    });
  } else {
    log?.(`Connecting to MongoDB at ${config.mongoUrl}`);
    await connect(config.mongoUrl);
  }
}

async function runBot() {
  const config = Config.getStandardConfig();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  }) as Client & {container: Container};

  const rest = new REST().setToken(config.token);

  const container = new Container({defaultScope: 'Singleton'});
  container.bind<IConfig>('Config').toConstantValue(config);
  registerServices(container);

  const logger = container.get<ILoggerService>('LoggerService');

  logger.debug('Loaded config', config);

  for (const command of commands) {
    logger.log(`Registering command ${command.name}`);
    container.bind('Command').to(command).whenTargetNamed(command.name);
  }

  // it is important to connect to the database before login or checking for updates
  await connectDatabase(config, logger.log.bind(logger));

  const materialSourceService = container.get<IMaterialSourceService>(
    'MaterialSourceService'
  );

  logger.log('Checking for material source updates');
  await materialSourceService.checkForUpdates();

  client.container = container;

  client.on(Events.ClientReady, onClientReady);
  client.on(Events.InteractionCreate, onInteractionCreate);

  await client.login(config.token);
  const clientId = client.application?.id;

  if (!clientId) {
    throw new Error('Client ID not found');
  }

  await rest.put(Routes.applicationCommands(clientId), {
    body: container.getAll<ICommand>('Command').map(command => command.data),
  });

  // warn if yt-dlp is not installed
  if (!commandExistsSync('yt-dlp')) {
    logger.warn(
      'yt-dlp is not installed. Some commands may not work as expected.'
    );
  }
}
