/**
 * @module utils/discord/loadCommands
 * @description
 * Shared directory-scan for `commands/discord/*.js`. Used by both the runtime
 * command loader ({@link module:handlers/discord/startup.registerCommands})
 * and the Discord REST publish path ({@link module:utils/discord/publishCommands},
 * `utils/helpers/generateCmds.js`) so the two can never read a different
 * list of command files from one another.
 *
 * @typedef {import('../core/types').DiscordSlashCommand} DiscordSlashCommand
 */

"use strict";

const fs = require("fs").promises;
const path = require("path");

/**
 * Read every `*.js` file in `commands/discord/` and `require()` it.
 *
 * @async
 * @returns {Promise<{file: string, command: DiscordSlashCommand}[]>}
 * @throws {Error} If two command files export the same `data.name` — Discord
 *   would silently only keep one of them, so this fails fast instead.
 */
async function loadCommandFiles() {
  const commandDir = path.join(process.cwd(), "commands", "discord");
  const commandFiles = (await fs.readdir(commandDir)).filter((f) =>
    f.endsWith(".js"),
  );

  const fileByName = new Map();
  const loaded = [];

  for (const file of commandFiles) {
    const command = require(path.join(commandDir, file));
    const name = command.data.name;

    if (fileByName.has(name)) {
      throw new Error(
        `Duplicate slash command name "${name}": both ${fileByName.get(name)} and ${file} export it.`,
      );
    }
    fileByName.set(name, file);
    loaded.push({ file, command });
  }

  return loaded;
}

module.exports = { loadCommandFiles };
