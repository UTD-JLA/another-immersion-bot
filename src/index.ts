import 'reflect-metadata';
import {Client, GatewayIntentBits, REST, Routes, Events} from 'discord.js';
import {connect} from 'mongoose';
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

(async function main() {
  if (process.argv.length > 2) {
    if (process.argv[2] === 'help') {
      printHelp();
      return;
    }
  }

  await runBot();
})();

function printHelp() {
  console.log('Available config variables:');
  ConfigFields.forEach(field => {
    console.log(
      `  ${field.name} - ${field.description} ${
        field.optional ? '(optional)' : ''
      }`
    );
  });
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

  logger.log(`Connecting to MongoDB at ${config.mongoUrl}`);
  await connect(config.mongoUrl);

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
