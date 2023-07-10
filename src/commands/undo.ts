import {ICommand} from '.';
import {IActivity} from '../models/activity';
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import {injectable, inject} from 'inversify';
import {IConfig, IColorConfig} from '../config';
import {IActivityService} from '../services/interfaces';

@injectable()
export default class UndoCommand implements ICommand {
  private readonly _colors: IColorConfig;
  private readonly _activityService: IActivityService;

  constructor(
    @inject('Config') config: IConfig,
    @inject('ActivityService') activityService: IActivityService
  ) {
    this._colors = config.colors;
    this._activityService = activityService;
  }

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

    let activity: IActivity;

    if (activityId) {
      const foundActivity = await this._activityService.getActivityById(
        activityId
      );
      if (!foundActivity) {
        await interaction.reply('Activity not found');
        return;
      } else if (foundActivity.userId !== interaction.user.id) {
        await interaction.reply('You cannot undo this activity');
        return;
      }

      activity = foundActivity;
    } else {
      const foundActivity = await this._activityService.getActivities(
        interaction.user.id,
        1
      );

      if (!foundActivity) {
        await interaction.reply('No activity to undo');
        return;
      }

      activity = foundActivity[0];
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
      )
      .setColor(this._colors.warning);

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
        await this._activityService.deleteActivityById(
          activity._id!.toString()
        );
        await interaction.editReply({
          embeds: [
            embed
              .setDescription('Activity undone')
              .setColor(this._colors.success),
          ],
          components: [],
        });
      } else if (confirmation.customId === 'cancel') {
        await interaction.editReply({
          embeds: [
            embed.setDescription('Undo cancelled').setColor(this._colors.error),
          ],
          components: [],
        });
      }
    } catch (error) {
      await interaction.editReply({
        embeds: [
          embed
            .setDescription('Undo cancelled')
            .setColor(this._colors.error)
            .setFooter({text: 'No response received'}),
        ],
        components: [],
      });
      return;
    }
  }
}
