/**
 * @module events/discord/interactionCreate
 * @description
 * Dispatches incoming `interactionCreate` events to the right slash-command
 * handler from `discordClient.commands`. Errors raised by command modules are
 * logged with the full stack and surfaced to the user as an ephemeral message
 * in their resolved language.
 *
 * @typedef {import('../../utils/types').DiscordEventHandler} DiscordEventHandler
 */

"use strict";

const { InteractionType, MessageFlags } = require("discord.js");
const { discordLog } = require("../../utils/loggers");
const { getLanguage } = require("../../utils/language");

/**
 * Look up and execute the slash command associated with `interaction`. On error,
 * post an ephemeral apology in the user's language and log the failure.
 *
 * @async
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').Client} client
 * @param {import('../../clientManager')} clientManager
 * @returns {Promise<void>}
 */
async function executeCommand(interaction, client, clientManager) {
  const command = client.commands.get(interaction.commandName);
  if (!command) {
    discordLog("warn", "interactionCreate:unknown command", {
      command: interaction.commandName,
      userId: interaction.user.id,
    });
    return;
  }

  discordLog("debug", "interactionCreate:executing", {
    command: interaction.commandName,
    userId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
  });

  try {
    await command.execute(interaction, client, clientManager);
    discordLog("info", "interactionCreate:executed", {
      command: interaction.commandName,
      userId: interaction.user.id,
    });
  } catch (error) {
    discordLog("error", "interactionCreate:execute failed", {
      command: interaction.commandName,
      userId: interaction.user.id,
      err: error.message,
      stack: error.stack,
    });

    const lang = getLanguage(interaction.channelId);
    const errorMessage =
      lang === "es"
        ? "Hubo un error al ejecutar este comando."
        : "There was an error while executing this command.";

    const replyOptions = {
      content: errorMessage,
      flags: MessageFlags.Ephemeral,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(replyOptions);
    } else {
      await interaction.reply(replyOptions);
    }
  }
}

/** @type {DiscordEventHandler} */
module.exports = {
  name: "interactionCreate",
  /**
   * @async
   * @param {import('discord.js').Interaction} interaction
   * @param {import('discord.js').Client} client
   * @param {import('../../clientManager')} clientManager
   * @returns {Promise<void>}
   */
  async execute(interaction, client, clientManager) {
    if (interaction.type === InteractionType.ApplicationCommand) {
      await executeCommand(interaction, client, clientManager);
    }
  },
};
