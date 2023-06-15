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

import LogCommand from './log';
import LeaderboardCommand from './leaderboard';

export {LogCommand, LeaderboardCommand};
