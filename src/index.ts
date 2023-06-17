import 'reflect-metadata';
import {Client, GatewayIntentBits, REST, Routes, Events} from 'discord.js';
import {connect} from 'mongoose';
import {Config, IConfig} from './config';
import {onClientReady, onInteractionCreate} from './events';
import commands, {ICommand} from './commands';
import {
  registerServices,
  IMaterialSourceService,
  ILoggerService,
} from './services';
import {Container} from 'inversify';

const config = Config.fromJsonFile(
  process.env['IB_CONFIG_LOCATION'] ?? 'config.json',
  {
    token: process.env['IB_TOKEN'],
    mongoUrl: process.env['IB_MONGO_URL'],
    chartServiceUrl: process.env['IB_CHART_SERVICE_URL'],
    materialsPath: process.env['IB_MATERIALS_PATH'],
    logLevel: process.env['IB_LOG_LEVEL'],
  }
);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
}) as Client & {container: Container};

const rest = new REST().setToken(config.token);

(async () => {
  const container = new Container({defaultScope: 'Singleton'});
  container.bind<IConfig>('Config').toConstantValue(config);
  registerServices(container);

  const logger = container.get<ILoggerService>('LoggerService');

  for (const command of commands) {
    logger.log(`Registering command ${command.name}`);
    container.bind('Command').to(command).whenTargetNamed(command.name);
  }

  logger.log('Connecting to MongoDB');
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
})();
