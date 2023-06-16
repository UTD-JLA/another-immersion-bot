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
import HistoryCommand from './history';
import UndoCommand from './undo';

export {LogCommand, LeaderboardCommand, HistoryCommand, UndoCommand};
