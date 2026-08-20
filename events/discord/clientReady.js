/**
 * @module events/discord/clientReady
 * @description
 * Fires once when the Discord gateway connection is established (`ClientReady`).
 * Sets the bot's initial idle presence so it always shows an activity from the
 * moment it connects, without waiting for a stream to start. Also publishes
 * the bot's slash commands to Discord (delete-then-recreate) using the same
 * command list already loaded onto `client.commands` — this is what makes
 * adding a new file under `commands/discord/` show up in Discord without a
 * separate manual `npm run generate-cmds` step.
 */

import { Events } from "discord.js";
import { setIdleStatus } from "../../utils/discord/discordPresence.js";
import { publishCommands } from "../../utils/discord/publishCommands.js";
import { discordLog as log } from "../../utils/core/loggers.js";

/** @type {import('../../utils/core/types').DiscordEventHandler} */
export const name = Events.ClientReady;
export const once = true;

/**
 * @async
 * @param {import('discord.js').Client} client - The ready client (same reference as discordClient).
 * @returns {Promise<void>}
 */
export async function execute(client) {
  if (!process.env.BOT_NAME) {
    process.env.BOT_NAME = client.user.username;
  }
  setIdleStatus(client);

  try {
    await publishCommands({
      token: process.env.DISCORD_TOKEN,
      applicationId: process.env.DISCORD_ID,
      commands: [...client.commands.values()],
      log,
    });
  } catch (error) {
    log("error", "clientReady:publishCommands failed", {
      err: error.message,
      stack: error.stack,
    });
  }
}
