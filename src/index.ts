import {Client, Events, GatewayIntentBits, REST, Routes} from 'discord.js';
import {connect} from 'mongoose';
import {Config} from './config';
import {ICommand, LogCommand} from './commands';
import AutocompletionService from './autocomplete';

const config = Config.fromJsonFile(
  process.env['IB_CONFIG_LOCATION'] ?? 'config.json'
);

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
}) as Client & {commands: ICommand[]};

const rest = new REST().setToken(config.token);

client.on(Events.ClientReady, () => {
  console.log('Client ready!');
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.find(
      command => command.data.name === interaction.commandName
    );

    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: 'There was an error while executing this command!',
        ephemeral: true,
      });
    }
  } else if (interaction.isAutocomplete()) {
    const command = client.commands.find(
      command => command.data.name === interaction.commandName
    );

    if (!command) return;
    if (!command.autocomplete) return;

    try {
      await command.autocomplete(interaction);
    } catch (error) {
      console.error(error);
    }
  }
});

(async () => {
  const [autocompleteService] = await Promise.all([
    AutocompletionService.fromSortedFile(config.autocompletionDataFile),
    connect(config.mongoUrl),
    client.login(config.token),
  ]);

  client.commands = [new LogCommand(autocompleteService)];

  const clientId = client.application?.id;

  if (!clientId) {
    throw new Error('Client ID not found');
  }

  await rest.put(Routes.applicationCommands(clientId), {
    body: client.commands.map(command => command.data.toJSON()),
  });
})();
