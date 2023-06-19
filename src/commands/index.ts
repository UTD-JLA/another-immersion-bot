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

//eslint-disable-next-line @typescript-eslint/no-explicit-any
type CommandConstructor = new (...args: any[]) => ICommand;

import LogCommand from './log';
import LeaderboardCommand from './leaderboard';
import HistoryCommand from './history';
import UndoCommand from './undo';
import ChartCommand from './chart';
import ExportCommand from './export';
import ConfigCommand from './config';

export default <CommandConstructor[]>[
  LogCommand,
  LeaderboardCommand,
  HistoryCommand,
  UndoCommand,
  ChartCommand,
  ExportCommand,
  ConfigCommand,
];
