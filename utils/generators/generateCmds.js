/**
 * @module utils/generators/generateCmds
 * @description
 * Standalone CLI script (`npm run generate-cmds`) for forcing an immediate
 * slash-command republish without restarting the bot process. The bot itself
 * already does this automatically on every startup (see
 * `events/discord/clientReady.js`) — this script is a manual escape hatch
 * that shares the same loader and publish logic, so the two can never drift.
 *
 * This file is a script, not a module — it logs to the console (rather than
 * Winston) because it runs outside the bot's normal lifecycle.
 */

"use strict";

const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const { loadCommandFiles } = require("../discord/loadCommands");
const { publishCommands } = require("../discord/publishCommands");

/**
 * Load every command file and publish them to Discord.
 *
 * @async
 * @returns {Promise<void>}
 */
async function main() {
  const loaded = await loadCommandFiles();
  console.log(`[i] Loaded ${loaded.length} command file(s).`);

  await publishCommands({
    token: process.env.DISCORD_TOKEN,
    applicationId: process.env.DISCORD_ID,
    commands: loaded.map(({ command }) => command),
    log: (level, message, context) => {
      const icon = level === "error" ? "❌" : "✅";
      console.log(`[${icon}] ${message}`, context ?? "");
    },
  });
}

main().catch((error) => {
  console.error(`[❌] Error in process: ${error.message}`);
  process.exitCode = 1;
});
