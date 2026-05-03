/**
 * @module handlers/discord/startup
 * @description
 * Discord auto-loader: reads every file under `events/discord/` and `commands/discord/`,
 * wires the events to the gateway client, and indexes commands on `discordClient.commands`
 * so `interactionCreate.js` can dispatch to them.
 *
 * @typedef {import('../../utils/types').DiscordEventHandler} DiscordEventHandler
 * @typedef {import('../../utils/types').DiscordSlashCommand} DiscordSlashCommand
 */

"use strict";

const { discordLog: log } = require("../../utils/loggers");
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
 * Read every `*.js` file in `commands/discord/` and store it on
 * `discordClient.commands` keyed by its slash-command name.
 *
 * @async
 * @param {import('discord.js').Client} discordClient
 * @returns {Promise<void>}
 */
async function registerCommands(discordClient) {
  const commandDir = path.join(process.cwd(), "commands", "discord");
  const commandFiles = (await fs.readdir(commandDir)).filter((f) =>
    f.endsWith(".js"),
  );
  log("debug", "discord:registerCommands scanning", {
    count: commandFiles.length,
  });

  for (const file of commandFiles) {
    const command = require(path.join(commandDir, file));
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
