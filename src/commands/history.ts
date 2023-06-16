import {ICommand} from '.';
import {Activity, IActivity} from '../models/activity';
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonStyle,
} from 'discord.js';

export default class HistoryCommand implements ICommand {
  public readonly data = <SlashCommandBuilder>new SlashCommandBuilder()
    .setName('history')
    .setDescription('Show your activity history')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to show the history of')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option
        .setName('show-ids')
        .setDescription('Show the ids of the activities')
        .setRequired(false)
    );

  public async execute(interaction: ChatInputCommandInteraction) {
    const userId =
      interaction.options.getUser('user')?.id ?? interaction.user.id;
    const showIds = interaction.options.getBoolean('show-ids') ?? false;

    // TODO: Do not fetch all activities at once
    const activities = await Activity.find({userId}).sort({date: -1});

    if (activities.length === 0) {
      await interaction.reply('No logs found');
      return;
    }

    const nextButton = new ButtonBuilder()
      .setCustomId('next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary);

    const previousButton = new ButtonBuilder()
      .setCustomId('previous')
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      previousButton,
      nextButton
    );

    let page = 0;
    const nPages = Math.ceil(activities.length / 6);
    const pageSize = 6;

    let embed = HistoryCommand._createEmbed(
      activities.slice(0, pageSize),
      showIds,
      page,
      nPages
    );

    const response = await interaction.reply({
      embeds: [embed],
      components: [row],
    });

    const collector = response.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 1000 * 60,
    });

    collector.on('collect', async i => {
      switch (i.customId) {
        case 'next':
          page++;
          break;
        case 'previous':
          page--;
          break;
      }

      if (page < 0) {
        page = 0;
      }

      if (page * pageSize + pageSize > activities.length) {
        page = Math.floor(activities.length / pageSize);
      }

      const startIndex = page * pageSize;
      const endIndex = Math.min(startIndex + pageSize, activities.length);

      embed = HistoryCommand._createEmbed(
        activities.slice(startIndex, endIndex),
        showIds,
        page,
        nPages
      );

      await i.update({
        embeds: [embed],
        components: [row],
      });
    });
  }

  private static _createEmbed(
    activities: IActivity[],
    showIds: boolean,
    page: number,
    nPages: number
  ): EmbedBuilder {
    const embed = new EmbedBuilder().setTitle('History').setFields(
      activities.map(activity => ({
        name: `${activity.date.toLocaleDateString()} ${activity.date.toLocaleTimeString()}`,
        value: `${activity.name}\n(${activity.duration} minutes) ${
          showIds ? `<${activity._id}>` : ''
        }`,
        inline: true,
      }))
    );

    if (nPages > 1) {
      embed.setFooter({text: `Page ${page + 1} of ${nPages}`});
    }

    return embed;
  }
}
