/**
 * @module utils/discord/publishCommands
 * @description
 * Publishes the bot's slash commands to Discord: deletes every existing
 * global application command, then bulk-uploads the current set. Deletes
 * before recreating (rather than a single bulk `PUT`) because Discord has
 * been observed to not always apply in-place command-schema updates reliably.
 *
 * Called automatically on every bot startup by {@link module:events/discord/clientReady},
 * and manually via `npm run generate-cmds` (`utils/generators/generateCmds.js`)
 * to force a republish without restarting the bot.
 *
 * @typedef {import('../core/types').DiscordSlashCommand} DiscordSlashCommand
 * @typedef {import('../core/types').DomainLogFn} DomainLogFn
 */

"use strict";

const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");

/**
 * @param {DomainLogFn} [log]
 * @returns {DomainLogFn}
 */
function resolveLogger(log) {
  if (log) return log;
  return (level, message, context) => {
    const fn = level === "error" ? console.error : console.log;
    fn(`[${level}] ${message}`, context ?? "");
  };
}

/**
 * Delete every existing global slash command for `applicationId`, then
 * publish `commands`.
 *
 * @async
 * @param {object} options
 * @param {string} options.token - Bot token used to authenticate the REST client.
 * @param {string} options.applicationId - Discord application (client) ID.
 * @param {DiscordSlashCommand[]} options.commands - Loaded command modules to publish.
 * @param {DomainLogFn} [options.log] - Logger; defaults to `console`.
 * @returns {Promise<void>}
 * @throws {Error} When listing, deleting, or publishing any command fails.
 */
async function publishCommands({ token, applicationId, commands, log }) {
  const logFn = resolveLogger(log);
  const rest = new REST({ version: "10" }).setToken(token);

  const existing = await rest.get(Routes.applicationCommands(applicationId));
  await Promise.all(
    existing.map((cmd) => {
      logFn("debug", "publishCommands:deleting", {
        name: cmd.name,
        id: cmd.id,
      });
      return rest.delete(
        `${Routes.applicationCommands(applicationId)}/${cmd.id}`,
      );
    }),
  );

  const body = commands.map((command) => command.data.toJSON());
  await rest.put(Routes.applicationCommands(applicationId), { body });

  logFn("info", "publishCommands:complete", {
    published: body.length,
    names: body.map((c) => c.name),
  });
}

module.exports = { publishCommands };
