/**
 * @module commands/discord/forcePolling
 * @description
 * `/forcePolling` slash command — manually triggers the YouTube slow poll
 * (3-hour schedule) to force a re-fetch of upcoming and live streams.
 * Syncs Discord Guild Scheduled Events if enabled.
 */

"use strict";

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  MessageFlags,
} = require("discord.js");
const { runSlowPoll } = require("../../handlers/youtube/startup");
const { discordLog } = require("../../utils/core/loggers");

/** @type {import('../../utils/core/types').DiscordSlashCommand} */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("forcepolling")
    .setDescription("Manually trigger YouTube stream polling (admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts(InteractionContextType.Guild),

  /**
   * @async
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {import('discord.js').Client} client
   * @param {import('../../handlers/clientManager')} clientManager
   * @returns {Promise<void>}
   */
  async execute(interaction, client, clientManager) {
    discordLog("debug", "forcePolling:execute", {
      issuer: interaction.user.id,
    });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await runSlowPoll(clientManager);
      const withSync = process.env.DISCORD_EVENTS_ENABLED === "true";
      await interaction.editReply({
        content: withSync
          ? "✅ YouTube polling triggered and Discord events synced successfully."
          : "✅ YouTube polling triggered successfully.",
        flags: MessageFlags.Ephemeral,
      });
      discordLog("info", "forcePolling:manual-trigger complete", {
        issuer: interaction.user.id,
        discordSync: withSync,
      });
    } catch (err) {
      discordLog("error", "forcePolling:execute failed", {
        issuer: interaction.user.id,
        err: err.message,
        stack: err.stack,
      });
      await interaction.editReply({
        content: `❌ Polling failed: ${err.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
