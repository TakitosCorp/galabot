/**
 * @module handlers/discord/startup
 * @description
 * Discord auto-loader: reads every file under `events/discord/` and `commands/discord/`,
 * wires the events to the gateway client, and indexes commands on `discordClient.commands`
 * so `interactionCreate.js` can dispatch to them.
 *
 * @typedef {import('../../utils/core/types').DiscordEventHandler} DiscordEventHandler
 * @typedef {import('../../utils/core/types').DiscordSlashCommand} DiscordSlashCommand
 */

"use strict";

const { discordLog: log } = require("../../utils/core/loggers");
const { loadCommandFiles } = require("../../utils/discord/loadCommands");
const { validateEmojis } = require("../../utils/discord/validateEmojis");
const { Collection } = require("discord.js");
const fs = require("fs").promises;
const path = require("path");

/**
 * Initialize the in-memory command index and register every event + command file.
 *
 * @async
 * @param {import('discord.js').Client} discordClient - The discord.js client.
 * @param {import('../../clientManager')} clientManager - Lifecycle owner forwarded to handlers.
 * @returns {Promise<void>}
 */
async function bootstrap(discordClient, clientManager) {
  log("debug", "discord:bootstrap start");
  discordClient.commands = new Collection();
  await registerEvents(discordClient, clientManager);
  await registerCommands(discordClient);
  validateEmojis();
  log("info", "discord:bootstrap complete", {
    commands: discordClient.commands.size,
  });
}

/**
 * Read every `*.js` file in `events/discord/` and bind it to the gateway client.
 * Each event module exports `{ name, once?, execute }` (see {@link DiscordEventHandler}).
 *
 * @async
 * @param {import('discord.js').Client} discordClient
 * @param {import('../../clientManager')} clientManager
 * @returns {Promise<void>}
 */
async function registerEvents(discordClient, clientManager) {
  const eventDir = path.join(process.cwd(), "events", "discord");
  const eventFiles = (await fs.readdir(eventDir)).filter((f) =>
    f.endsWith(".js"),
  );
  log("debug", "discord:registerEvents scanning", { count: eventFiles.length });

  for (const file of eventFiles) {
    const event = require(path.join(eventDir, file));
    const eventName = event.name;

    if (event.once) {
      discordClient.once(eventName, (...args) =>
        event.execute(...args, discordClient, clientManager),
      );
    } else {
      discordClient.on(eventName, (...args) =>
        event.execute(...args, discordClient, clientManager),
      );
    }
    log("info", "discord:event registered", {
      file,
      eventName,
      once: Boolean(event.once),
    });
  }
}

/**
 * Read every `*.js` file in `commands/discord/` (via {@link loadCommandFiles})
 * and store each one on `discordClient.commands` keyed by its slash-command
 * name. This is the same file list {@link module:events/discord/clientReady}
 * later publishes to Discord's REST API, so the two can never drift apart.
 *
 * @async
 * @param {import('discord.js').Client} discordClient
 * @returns {Promise<void>}
 */
async function registerCommands(discordClient) {
  const loaded = await loadCommandFiles();
  log("debug", "discord:registerCommands scanning", { count: loaded.length });

  for (const { file, command } of loaded) {
    discordClient.commands.set(command.data.name, command);
    log("info", "discord:command registered", {
      file,
      command: command.data.name,
    });
  }
}

module.exports = {
  bootstrap,
};
