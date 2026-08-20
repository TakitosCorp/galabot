/**
 * @module commands/discord/ban
 * @description
 * `/ban` slash command — permanently bans a target user and deletes a
 * configurable number of days of their recent messages (0–7, default 7).
 *
 * Behaviour:
 *  - Validates that the target is in the guild, is not a bot, is not an admin,
 *    is not the issuer, and is bannable by the bot (role hierarchy).
 *  - Attempts a DM to the target before executing the ban so they are notified.
 *  - Executes the ban via {@link GuildMember#ban} with `deleteMessageSeconds`
 *    set to `deleteDays × 86 400`.
 *  - Replies publicly with a ban embed on success.
 *
 * @typedef {import('../../utils/core/types.js').DiscordSlashCommand} DiscordSlashCommand
 */

import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  MessageFlags,
} from "discord.js";
import { discordLog } from "../../utils/core/loggers.js";
import { getLanguage } from "../../utils/core/language.js";
import strings from "../../lang/discord/ban.js";
import {
  MAX_WARN_REASON_LENGTH,
  BAN_DELETE_DAYS_DEFAULT,
} from "../../utils/core/constants.js";

/** @type {DiscordSlashCommand} */
export const data = new SlashCommandBuilder()
  .setName("ban")
  .setDescription("Permanently bans a user and deletes their recent messages.")
  .addUserOption((option) =>
    option.setName("user").setDescription("The user to ban.").setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("The reason for the ban.")
      .setRequired(false),
  )
  .addIntegerOption((option) =>
    option
      .setName("delete_days")
      .setDescription("Days of messages to delete (0–7). Defaults to 7.")
      .setMinValue(0)
      .setMaxValue(7)
      .setRequired(false),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .setContexts(InteractionContextType.Guild);

/**
 * @async
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {Promise<void>}
 */
export async function execute(interaction) {
  const lang = getLanguage(interaction.channelId);
  const t = strings[lang];

  const user = interaction.options.getUser("user");
  const reason =
    interaction.options.getString("reason") ?? "No reason provided.";
  const deleteDays =
    interaction.options.getInteger("delete_days") ?? BAN_DELETE_DAYS_DEFAULT;

  discordLog("debug", "ban:execute", {
    issuer: interaction.user.id,
    target: user.id,
    deleteDays,
    reasonLength: reason.length,
  });

  if (reason.length > MAX_WARN_REASON_LENGTH) {
    discordLog("warn", "ban:reason-too-long", {
      target: user.id,
      length: reason.length,
      max: MAX_WARN_REASON_LENGTH,
    });
    return interaction.reply({
      content: `Reason too long (${reason.length} chars). Maximum is ${MAX_WARN_REASON_LENGTH}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const guildMember = await interaction.guild.members
    .fetch(user.id)
    .catch(() => null);

  if (!guildMember) {
    discordLog("debug", "ban:target-not-in-server", { target: user.id });
    return interaction.reply({
      content: t.errNotInServer,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (user.bot) {
    discordLog("debug", "ban:target-is-bot", { target: user.id });
    return interaction.reply({
      content: t.errBot,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (guildMember.permissions.has(PermissionFlagsBits.Administrator)) {
    discordLog("debug", "ban:target-is-admin", { target: user.id });
    return interaction.reply({
      content: t.errAdmin,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (user.id === interaction.user.id) {
    discordLog("debug", "ban:self-ban rejected", { target: user.id });
    return interaction.reply({
      content: t.errSelf,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!guildMember.bannable) {
    discordLog("debug", "ban:target-not-bannable", { target: user.id });
    return interaction.reply({
      content: t.errNotBannable,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (
    !interaction.guild.members.me.permissions.has(
      PermissionFlagsBits.BanMembers,
    )
  ) {
    discordLog("warn", "ban:no-ban-perms", { target: user.id });
    return interaction.reply({
      content: t.errNoBanPerms,
      flags: MessageFlags.Ephemeral,
    });
  }

  // Acknowledge the interaction before performing long-running operations
  // (DM + API ban call can take 1–3+ seconds; Discord requires acknowledgment within 3 seconds)
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const banEmbed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle(t.banTitle(user.username))
    .addFields(
      { name: t.reasonField, value: reason },
      { name: t.actionField, value: t.banAction },
      { name: t.deletedField, value: t.deletedDays(deleteDays) },
    );

  try {
    await user.send({ embeds: [banEmbed] });
  } catch (error) {
    discordLog("warn", "ban:dm-failed", {
      target: user.username,
      err: error.message,
    });
  }

  try {
    await guildMember.ban({
      deleteMessageSeconds: deleteDays * 86_400,
      reason,
    });
    await interaction.editReply({ embeds: [banEmbed] });
    discordLog("info", "ban:banned", {
      target: user.username,
      targetId: user.id,
      issuer: interaction.user.username,
      deleteDays,
      reason,
    });
  } catch (error) {
    discordLog("error", "ban:ban-api-failed", {
      target: user.username,
      err: error.message,
      stack: error.stack,
    });
    await interaction.editReply({
      content: t.errBanFailed(user.username),
      flags: MessageFlags.Ephemeral,
    });
  }
}
