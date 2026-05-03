/**
 * @module events/discord/messageCreate
 * @description
 * Listens for messages in any guild text channel and routes them to:
 *  - the ping handler when the bot's owner (`GALA_DISCORD_ID`) is mentioned, or
 *  - the greeting handler when the message matches a known greeting in the
 *    user's resolved language.
 *
 * Bot-authored messages and DMs are ignored.
 *
 * @typedef {import('../../utils/types').DiscordEventHandler} DiscordEventHandler
 */

"use strict";

const resources = require("../../data/resources.json");
const { handleHello } = require("../../messages/discord/msgHello");
const { handlePing } = require("../../messages/discord/msgPing");
const { getLanguage } = require("../../utils/language");
const { discordLog } = require("../../utils/loggers");

/** @type {DiscordEventHandler} */
module.exports = {
  name: "messageCreate",
  /**
   * @async
   * @param {import('discord.js').Message} message - Incoming Discord message.
   * @param {import('discord.js').Client} client - Gateway client (unused, kept for handler signature).
   * @param {import('../../clientManager')} clientManager - Lifecycle owner (unused here).
   * @returns {Promise<void>}
   */
  async execute(message, client, clientManager) {
    if (message.author.bot || !message.guild) return;

    const lang = getLanguage(message.channelId);

    if (message.content.includes(`<@${process.env.GALA_DISCORD_ID}>`)) {
      discordLog("debug", "messageCreate:ping detected", {
        userId: message.author.id,
        channelId: message.channelId,
        guildId: message.guildId,
      });
      await handlePing(message, lang);
      return;
    }

    const content = message.content.toLowerCase().trim();
    const isGreeting = resources[lang].greetings.some(
      (greet) =>
        new RegExp(`^${greet}$`, "i").test(content) ||
        new RegExp(`\\b${greet}\\b`, "i").test(content),
    );

    if (isGreeting) {
      discordLog("debug", "messageCreate:greeting matched", {
        userId: message.author.id,
        channelId: message.channelId,
        lang,
      });
      await handleHello(message, lang);
    }
  },
  once: false,
};
