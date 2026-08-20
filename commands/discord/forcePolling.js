/**
 * @module commands/discord/forcePolling
 * @description
 * `/forcePolling` slash command — manually triggers the YouTube slow poll
 * (3-hour schedule) to force a re-fetch of upcoming and live streams.
 * Syncs Discord Guild Scheduled Events if enabled.
 */

import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  MessageFlags,
} from "discord.js";
import { runSlowPoll } from "../../handlers/youtube/startup.js";
import { discordLog } from "../../utils/core/loggers.js";

/** @type {import('../../utils/core/types.js').DiscordSlashCommand} */
export const data = new SlashCommandBuilder()
  .setName("forcepolling")
  .setDescription("Manually trigger YouTube stream polling (admin only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild);

/**
 * @async
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').Client} client
 * @param {import('../../handlers/clientManager.js')} clientManager
 * @returns {Promise<void>}
 */
export async function execute(interaction, client, clientManager) {
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
}
