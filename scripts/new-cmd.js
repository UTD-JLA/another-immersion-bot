const fs = require('fs');

if (process.argv.length < 3) {
  throw new Error('Command name is required');
}

const commandDir = './src/commands';
const name = process.argv[2];
const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
const fileName = `${commandDir}/${name}.ts`;

const fileContent = `import {ICommand} from '.';
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from 'discord.js';
import {injectable} from 'inversify';

@injectable()
export default class ${capitalizedName}Command implements ICommand {
  public readonly data = new SlashCommandBuilder()
    .setName('${name}')
    .setDescription('${capitalizedName} command');

  public async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply('${capitalizedName} command');
  }

  public autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}
`;

if (!fs.existsSync(commandDir)) {
  fs.mkdirSync(commandDir);
}

if (fs.existsSync(fileName)) {
  throw new Error(`Command '${name}' already exists`);
}

fs.writeFileSync(fileName, fileContent);
console.log(`Command '${name}' created`);
console.log(
  `Don't forget to add it to the list: vscode://file/${__dirname.replace(
    '/scripts',
    '/src/commands/index.ts'
  )}`
);
