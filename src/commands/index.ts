import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from 'discord.js';

export interface ICommand {
  readonly data: SlashCommandBuilder;
  readonly execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  readonly autocomplete?: (
    interaction: AutocompleteInteraction
  ) => Promise<void>;
}

import Log from './log';

export default <ICommand[]>[new Log()];
