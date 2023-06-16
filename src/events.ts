import {Interaction} from 'discord.js';
import {ICommand} from './commands';

declare module 'discord.js' {
  interface Client {
    commands: ICommand[];
  }
}

export async function onInteractionCreate(
  interaction: Interaction
): Promise<void> {
  if (!interaction.client.commands) throw new Error('Commands not found');

  if (interaction.isChatInputCommand()) {
    const command = interaction.client.commands.find(
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
    const command = interaction.client.commands.find(
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
}

export function onClientReady(): void {
  console.log('Client ready!');
}
