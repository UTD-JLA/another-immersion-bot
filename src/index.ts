import {Client, GatewayIntentBits, REST, Routes, Events} from 'discord.js';
import {connect} from 'mongoose';
import {Config} from './config';
import {onClientReady, onInteractionCreate} from './events';
import {
  ICommand,
  LeaderboardCommand,
  LogCommand,
  HistoryCommand,
  UndoCommand,
} from './commands';
import AutocompletionService from './autocomplete';

const config = Config.fromJsonFile(
  process.env['IB_CONFIG_LOCATION'] ?? 'config.json'
);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
}) as Client & {commands: ICommand[]};

const rest = new REST().setToken(config.token);

(async () => {
  const [autocompleteService] = await Promise.all([
    AutocompletionService.fromSortedFile(config.autocompletionDataFile),
    connect(config.mongoUrl),
  ]);

  client.commands = [
    new LogCommand(autocompleteService),
    new LeaderboardCommand(),
    new HistoryCommand(),
    new UndoCommand(),
  ];

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
