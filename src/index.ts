import 'reflect-metadata';
import {Client, GatewayIntentBits, REST, Routes, Events} from 'discord.js';
import {connect} from 'mongoose';
import {Config, IConfig} from './config';
import {onClientReady, onInteractionCreate} from './events';
import commands, {ICommand} from './commands';
import {registerServices} from './services';
import {Container} from 'inversify';

const config = Config.fromJsonFile(
  process.env['IB_CONFIG_LOCATION'] ?? 'config.json'
);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
}) as Client & {commands: ICommand[]};

const rest = new REST().setToken(config.token);

(async () => {
  const container = new Container({defaultScope: 'Singleton'});
  container.bind<IConfig>('Config').toConstantValue(config);
  registerServices(container);

  for (const command of commands) {
    container.bind('Command').to(command).whenTargetNamed(command.name);
  }

  await connect(config.mongoUrl);

  client.commands = container.getAll<ICommand>('Command');

  client.on(Events.ClientReady, onClientReady);
  client.on(Events.InteractionCreate, onInteractionCreate);

  await client.login(config.token);
  const clientId = client.application?.id;

  if (!clientId) {
    throw new Error('Client ID not found');
  }

  await rest.put(Routes.applicationCommands(clientId), {
    body: client.commands.map(command => command.data.toJSON()),
  });
})();
