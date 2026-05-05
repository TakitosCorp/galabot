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
const { updateWorkflow } = require("../../utils/youtubePoller");
const { discordLog } = require("../../utils/loggers");

/**
 * Manually trigger YouTube polling and sync Discord events.
 *
 * @async
 * @param {import('../../clientManager')} clientManager
 * @returns {Promise<string>} Success message.
 * @throws {Error} When polling fails.
 */
async function runManualPoll(clientManager) {
  discordLog("debug", "forcePolling:runManualPoll start");

  try {
    await updateWorkflow();

    if (process.env.DISCORD_EVENTS_ENABLED === "true") {
      const { syncYouTubeDiscordEvents } = require("../../handlers/youtube/startup");
      await syncYouTubeDiscordEvents(clientManager.discordClient);
      discordLog("info", "forcePolling:manual-trigger complete with sync");
      return "✅ YouTube polling triggered and Discord events synced successfully.";
    }

    discordLog("info", "forcePolling:manual-trigger complete");
    return "✅ YouTube polling triggered successfully.";
  } catch (err) {
    discordLog("error", "forcePolling:manual-trigger failed", {
      err: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/** @type {import('../../utils/types').DiscordSlashCommand} */
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
   * @param {import('../../clientManager')} clientManager
   * @returns {Promise<void>}
   */
  async execute(interaction, client, clientManager) {
    discordLog("debug", "forcePolling:execute", {
      issuer: interaction.user.id,
    });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const message = await runManualPoll(clientManager);
      await interaction.editReply({
        content: message,
        flags: MessageFlags.Ephemeral,
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
