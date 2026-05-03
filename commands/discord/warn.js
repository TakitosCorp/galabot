/**
 * @module commands/discord/warn
 * @description
 * `/warn` slash command — issues a warning to a target user with a moderator-supplied reason.
 * Behaviour:
 *  - Validates that the target is in the guild, is not a bot, is not an admin, and is not the issuer.
 *  - Rejects reasons longer than {@link MAX_WARN_REASON_LENGTH}.
 *  - On the {@link MAX_WARN_BEFORE_BAN}-th warn the target is banned instead of timed out.
 *  - Otherwise applies a timeout proportional to the new warn count
 *    (`newCount * WARN_TIMEOUT_BASE_MS`).
 *
 * @typedef {import('../../utils/types').DiscordSlashCommand} DiscordSlashCommand
 */

"use strict";

const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  MessageFlags,
} = require("discord.js");
const { addWarn, getWarnCount } = require("../../db/warns");
const { discordLog } = require("../../utils/loggers");
const { getLanguage } = require("../../utils/language");
const strings = require("../../lang/warn");
const {
  WARN_TIMEOUT_BASE_MS,
  MAX_WARN_BEFORE_BAN,
  MAX_WARN_REASON_LENGTH,
} = require("../../utils/constants");

/**
 * Permanently ban `user` from the guild and DM them the ban embed if possible.
 * Falls back to a public ephemeral error reply when the bot lacks the
 * `BanMembers` permission or the ban API call fails.
 *
 * @async
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').User} user - The user being banned.
 * @param {import('discord.js').GuildMember} guildMember - The same user, resolved as a guild member.
 * @param {object} t - Localised strings for the resolved language.
 * @param {object} tEn - English strings (used for log messages so logs stay grep-able).
 * @returns {Promise<void>}
 */
async function handleBan(interaction, user, guildMember, t, tEn) {
  discordLog("debug", "warn:handleBan", {
    target: user.id,
    issuer: interaction.user.id,
  });
  const banEmbed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle(t.banTitle(user.username))
    .addFields(
      { name: t.reasonField, value: t.banReason },
      { name: t.actionField, value: t.banAction },
    );

  if (
    interaction.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)
  ) {
    try {
      await user.send({ embeds: [banEmbed] });
    } catch (error) {
      discordLog("warn", "warn:ban-dm failed", {
        target: user.username,
        err: error.message,
      });
    }

    try {
      await guildMember.ban({ reason: t.banReason });
      await interaction.reply({ embeds: [banEmbed] });
      discordLog("info", "warn:banned", {
        target: user.username,
        targetId: user.id,
        issuer: interaction.user.username,
      });
    } catch (error) {
      discordLog("error", "warn:ban-api failed", {
        target: user.username,
        err: error.message,
        stack: error.stack,
      });
      await interaction.reply({
        content: t.errBanFailed(user.username),
        flags: MessageFlags.Ephemeral,
      });
    }
  } else {
    discordLog("warn", "warn:no-ban-perms", { target: user.id });
    await interaction.reply({
      content: t.errNoBanPerms,
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * Persist a new warning for `user` and apply a scaling timeout. DMs the user the
 * warn embed when permitted, then posts the embed publicly via the interaction reply.
 *
 * @async
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').User} user
 * @param {import('discord.js').GuildMember} guildMember
 * @param {string} reason - Moderator-supplied reason (already length-validated).
 * @param {object} t - Localised strings for the resolved language.
 * @param {object} tEn - English strings used for log lines.
 * @returns {Promise<void>}
 */
async function handleWarn(interaction, user, guildMember, reason, t, tEn) {
  discordLog("debug", "warn:handleWarn", {
    target: user.id,
    issuer: interaction.user.id,
  });
  await addWarn(user.id, reason);
  const newWarnCount = await getWarnCount(user.id);
  const timeoutDuration = newWarnCount * WARN_TIMEOUT_BASE_MS;

  const warnEmbed = new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle(t.warnTitle(user.username))
    .addFields(
      { name: t.reasonField, value: reason },
      { name: t.warnCount, value: `${newWarnCount}` },
      {
        name: t.timeoutDuration,
        value: t.timeoutMinutes(timeoutDuration / 60000),
      },
    );

  if (
    interaction.guild.members.me.permissions.has(
      PermissionFlagsBits.ModerateMembers,
    )
  ) {
    try {
      await user.send({ embeds: [warnEmbed] });
    } catch (error) {
      discordLog("warn", "warn:warn-dm failed", {
        target: user.username,
        err: error.message,
      });
    }

    try {
      await guildMember.timeout(timeoutDuration, reason);
      await interaction.reply({ embeds: [warnEmbed] });
      discordLog("info", "warn:timeout-applied", {
        target: user.username,
        targetId: user.id,
        minutes: timeoutDuration / 60000,
        issuer: interaction.user.username,
        warnCount: newWarnCount,
      });
    } catch (error) {
      discordLog("error", "warn:timeout-api failed", {
        target: user.username,
        err: error.message,
        stack: error.stack,
      });
      await interaction.reply({
        content: t.errTimeoutFailed(user.username),
        flags: MessageFlags.Ephemeral,
      });
    }
  } else {
    discordLog("warn", "warn:no-timeout-perms", { target: user.id });
    await interaction.reply({
      content: t.errNoTimeoutPerms,
      flags: MessageFlags.Ephemeral,
    });
  }
}

/** @type {DiscordSlashCommand} */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Adds a warning to a user and applies a timeout.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to warn.")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("The reason for the warning.")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild),

  /**
   * @async
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {import('discord.js').Client} client
   * @param {import('../../clientManager')} clientManager
   * @returns {Promise<void>}
   */
  async execute(interaction, client, clientManager) {
    const lang = getLanguage(interaction.channelId);
    const t = strings[lang];
    const tEn = strings.en;
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason");
    const guildMember = await interaction.guild.members
      .fetch(user.id)
      .catch(() => null);

    discordLog("debug", "warn:execute", {
      issuer: interaction.user.id,
      target: user.id,
      reasonLength: reason.length,
    });

    if (reason.length > MAX_WARN_REASON_LENGTH) {
      discordLog("warn", "warn:reason-too-long", {
        target: user.id,
        length: reason.length,
        max: MAX_WARN_REASON_LENGTH,
      });
      return interaction.reply({
        content: `Reason too long (${reason.length} chars). Maximum is ${MAX_WARN_REASON_LENGTH}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!guildMember) {
      discordLog("debug", "warn:target-not-in-server", { target: user.id });
      return interaction.reply({
        content: t.errNotInServer,
        flags: MessageFlags.Ephemeral,
      });
    }
    if (user.bot) {
      discordLog("debug", "warn:target-is-bot", { target: user.id });
      return interaction.reply({
        content: t.errBot,
        flags: MessageFlags.Ephemeral,
      });
    }
    if (guildMember.permissions.has(PermissionFlagsBits.Administrator)) {
      discordLog("debug", "warn:target-is-admin", { target: user.id });
      return interaction.reply({
        content: t.errAdmin,
        flags: MessageFlags.Ephemeral,
      });
    }
    if (user.id === interaction.user.id) {
      discordLog("debug", "warn:self-warn rejected", { target: user.id });
      return interaction.reply({
        content: t.errSelf,
        flags: MessageFlags.Ephemeral,
      });
    }

    const currentWarns = await getWarnCount(user.id);

    if (currentWarns >= MAX_WARN_BEFORE_BAN) {
      await handleBan(interaction, user, guildMember, t, tEn);
    } else {
      await handleWarn(interaction, user, guildMember, reason, t, tEn);
    }
  },
};
