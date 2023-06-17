import {Client, Interaction} from 'discord.js';
import {ICommand} from './commands';
import {Container} from 'inversify';
import {ILoggerService} from './services';

declare module 'discord.js' {
  interface Client {
    container: Container;
  }
}

export async function onInteractionCreate(
  interaction: Interaction
): Promise<void> {
  const logger =
    interaction.client.container.get<ILoggerService>('LoggerService');
  const commands = interaction.client.container.getAll<ICommand>('Command');

  if (interaction.isChatInputCommand()) {
    const command = commands.find(
      command => command.data.name === interaction.commandName
    );

    if (!command) return;

    logger.log(
      `Command ${command.data.name} called by ${interaction.user.tag} (${interaction.user.id})`
    );

    try {
      await command.execute(interaction);
    } catch (error) {
      logger.error(String(error), {error});
      if (interaction.replied || interaction.deferred)
        await interaction.followUp({
          content: 'There was an error while executing this command!',
          ephemeral: true,
        });
      else
        await interaction.reply({
          content: 'There was an error while executing this command!',
          ephemeral: true,
        });
    }
  } else if (interaction.isAutocomplete()) {
    const command = commands.find(
      command => command.data.name === interaction.commandName
    );

    if (!command) return;
    if (!command.autocomplete) return;

    try {
      await command.autocomplete(interaction);
    } catch (error) {
      logger.error(String(error), {error});
    }
  }
}

export function onClientReady(client: Client): void {
  const logger = client.container.get<ILoggerService>('LoggerService');
  logger.log('Client ready');
}
