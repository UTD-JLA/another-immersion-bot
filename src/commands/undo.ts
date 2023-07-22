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
import {IActivityService, ILocalizationService} from '../services/interfaces';

@injectable()
export default class UndoCommand implements ICommand {
  private readonly _colors: IColorConfig;
  private readonly _activityService: IActivityService;
  private readonly _localizationService: ILocalizationService;

  constructor(
    @inject('Config') config: IConfig,
    @inject('ActivityService') activityService: IActivityService,
    @inject('LocalizationService') localizationService: ILocalizationService
  ) {
    this._colors = config.colors;
    this._activityService = activityService;
    this._localizationService = localizationService;
  }

  public get data() {
    return new SlashCommandBuilder()
      .setName('undo')
      .setNameLocalizations(
        this._localizationService.getAllLocalizations('undo.name')
      )
      .setDescription('Undo the last activity')
      .setDescriptionLocalizations(
        this._localizationService.getAllLocalizations('undo.description')
      )
      .addStringOption(option =>
        option
          .setName('id')
          .setNameLocalizations(
            this._localizationService.getAllLocalizations('undo.id.name')
          )
          .setDescription('Specify the id of the activity to undo')
          .setDescriptionLocalizations(
            this._localizationService.getAllLocalizations('undo.id.description')
          )
          .setRequired(false)
      ) as SlashCommandBuilder;
  }

  public async execute(interaction: ChatInputCommandInteraction) {
    const i18n = this._localizationService.useScope(
      interaction.locale,
      'undo.messages'
    );

    const activityId = interaction.options.getString('id');

    let activity: IActivity;

    if (activityId) {
      const foundActivity = await this._activityService.getActivityById(
        activityId
      );
      if (!foundActivity) {
        const message = i18n.localize('activity-not-found');
        await interaction.reply(message ?? 'Activity not found');
        return;
      } else if (foundActivity.userId !== interaction.user.id) {
        const message = i18n.localize('cannot-undo');
        await interaction.reply(message ?? 'Cannot undo this activity');
        return;
      }

      activity = foundActivity;
    } else {
      const foundActivity = await this._activityService.getActivities(
        interaction.user.id,
        1
      );

      if (foundActivity.length === 0) {
        const message = i18n.localize('no-activity');
        await interaction.reply(message ?? 'No activity found');
        return;
      }

      activity = foundActivity[0];
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('cancel')
        .setLabel(i18n.mustLocalize('cancel', 'Cancel'))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('undo')
        .setLabel(i18n.mustLocalize('undo', 'Undo'))
        .setStyle(ButtonStyle.Danger)
    );

    const confirmationMessage = i18n.localize(
      'undo-confirmation',
      activity.name
    );

    const embed = new EmbedBuilder()
      .setTitle(i18n.mustLocalize('undo-title', 'Undo'))
      .setDescription(
        confirmationMessage ??
          `Are you sure you want to undo the activity "${activity.name}"?`
      )
      .setColor(this._colors.warning);

    const response = await interaction.reply({
      embeds: [embed],
      components: [row],
    });

    const undoneMessage = i18n.localize('activity-undone');
    const cancelledMessage = i18n.localize('undo-cancelled');
    const noResponseMessage = i18n.localize('no-response');

    try {
      const confirmation = await response.awaitMessageComponent({
        filter: i => i.user.id === interaction.user.id,
        time: 10000,
      });

      if (confirmation.customId === 'undo') {
        await this._activityService.deleteActivityById(activity.id);
        await interaction.editReply({
          embeds: [
            embed
              .setDescription(undoneMessage ?? 'Activity undone')
              .setColor(this._colors.success),
          ],
          components: [],
        });
      } else if (confirmation.customId === 'cancel') {
        await interaction.editReply({
          embeds: [
            embed
              .setDescription(cancelledMessage ?? 'Undo cancelled')
              .setColor(this._colors.error),
          ],
          components: [],
        });
      }
    } catch (error) {
      // TODO: check if error is a timeout error
      await interaction.editReply({
        embeds: [
          embed
            .setDescription(cancelledMessage ?? 'Undo cancelled')
            .setColor(this._colors.error)
            .setFooter({text: noResponseMessage ?? 'No response received'}),
        ],
        components: [],
      });
      return;
    }
  }
}
