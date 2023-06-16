import {ICommand} from '.';
import {Activity, IActivity} from '../models/activity';
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import {Document} from 'mongoose';

export default class UndoCommand implements ICommand {
  public readonly data = <SlashCommandBuilder>new SlashCommandBuilder()
    .setName('undo')
    .setDescription('Undo the last activity')
    .addStringOption(option =>
      option
        .setName('id')
        .setDescription('Specify the id of the activity to undo')
        .setRequired(false)
    );

  public async execute(interaction: ChatInputCommandInteraction) {
    const activityId = interaction.options.getString('id');

    let activity: IActivity & Document;

    if (activityId) {
      const foundActivity = await Activity.findById(activityId);
      if (!foundActivity) {
        await interaction.reply('Activity not found');
        return;
      } else if (foundActivity.userId !== interaction.user.id) {
        await interaction.reply('You cannot undo this activity');
        return;
      }

      activity = foundActivity;
    } else {
      const foundActivity = await Activity.findOne(
        {userId: interaction.user.id},
        {},
        {sort: {date: -1}}
      );

      if (!foundActivity) {
        await interaction.reply('No activity to undo');
        return;
      }

      activity = foundActivity;
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('undo')
        .setLabel('Undo')
        .setStyle(ButtonStyle.Danger)
    );

    const embed = new EmbedBuilder()
      .setTitle('Undo')
      .setDescription(
        `Are you sure you want to undo the activity "${activity.name}"?`
      );

    const response = await interaction.reply({
      embeds: [embed],
      components: [row],
    });

    try {
      const confirmation = await response.awaitMessageComponent({
        filter: i => i.user.id === interaction.user.id,
        time: 10000,
      });

      if (confirmation.customId === 'undo') {
        await activity.deleteOne();
        await interaction.editReply({
          embeds: [embed.setDescription('Activity undone')],
          components: [],
        });
      } else if (confirmation.customId === 'cancel') {
        await interaction.editReply({
          embeds: [embed.setDescription('Undo cancelled')],
          components: [],
        });
      }
    } catch (error) {
      await interaction.editReply({
        embeds: [embed.setDescription('Undo cancelled')],
        components: [],
      });
      return;
    }
  }
}
