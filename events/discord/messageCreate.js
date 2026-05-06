/**
 * @module events/discord/messageCreate
 * @description
 * Listens for messages in any guild text channel and routes them to:
 *  - the ping handler when Gala's personal account (`GALA_USER_ID`) is mentioned,
 *  - the greeting handler when the bot itself is mentioned and the message matches
 *    a known greeting in the user's resolved language,
 *  - the AI handler when the bot itself is mentioned with a non-greeting message,
 *    when the message is a reply to the bot, when the bot's name appears in the
 *    message (case-insensitive), or when no mention is present but the message
 *    is a greeting.
 *
 * Bot-authored messages and DMs are ignored.
 *
 * @typedef {import('../../utils/types').DiscordEventHandler} DiscordEventHandler
 */

"use strict";

const resources = require("../../data/resources.json");
const { handleHello } = require("../../messages/discord/msgHello");
const { handlePing } = require("../../messages/discord/msgPing");
const { handleAI } = require("../../messages/discord/msgAI");
const { getLanguage } = require("../../utils/core/language");
const { discordLog } = require("../../utils/core/loggers");

/** @type {DiscordEventHandler} */
module.exports = {
  name: "messageCreate",
  /**
   * @async
   * @param {import('discord.js').Message} message - Incoming Discord message.
   * @param {import('discord.js').Client} client - Gateway client (used to resolve the bot's own user id).
   * @param {import('../../clientManager')} clientManager - Lifecycle owner (unused here).
   * @returns {Promise<void>}
   */
  async execute(message, client, clientManager) {
    if (message.author.bot || !message.guild) return;

    const lang = getLanguage(message.channelId);

    const content = message.content.toLowerCase().trim();
    const isGreeting = resources[lang].greetings.some(
      (greet) =>
        new RegExp(`^${greet}$`, "i").test(content) ||
        new RegExp(`\\b${greet}\\b`, "i").test(content),
    );

    // Warn/ban when Gala's personal Discord account is @-mentioned.
    if (
      process.env.GALA_USER_ID &&
      message.content.includes(`<@${process.env.GALA_USER_ID}>`)
    ) {
      discordLog("debug", "messageCreate:gala-user-ping", {
        userId: message.author.id,
        channelId: message.channelId,
        guildId: message.guildId,
      });
      await handlePing(message, lang);
      return;
    }

    // Check if replying to the bot or mentioning bot's name (case-insensitive).
    const isBotReply = message.reference
      ? (
          await message.channel.messages
            .fetch(message.reference.messageId)
            .catch(() => null)
        )?.author?.id === client.user.id
      : false;

    const botNameLower = client.user.username.toLowerCase();
    const isBotNameMentioned = content.includes(botNameLower);

    // Bot @mention → greeting or AI reply.
    if (message.content.includes(`<@${client.user.id}>`)) {
      if (isGreeting) {
        discordLog("debug", "messageCreate:bot-mention+greeting", {
          userId: message.author.id,
          channelId: message.channelId,
          lang,
        });
        const greeted = await handleHello(message, lang);
        if (greeted === false && process.env.GEMINI_ENABLE !== "false") {
          await handleAI(message);
        }
      } else if (process.env.GEMINI_ENABLE !== "false") {
        discordLog("debug", "messageCreate:bot-mention+ai", {
          userId: message.author.id,
          channelId: message.channelId,
        });
        await handleAI(message);
      }
      return;
    }

    // Reply to bot or bot name mentioned → AI reply (unless greeting, or greeting is on cooldown).
    if (
      (isBotReply || isBotNameMentioned) &&
      process.env.GEMINI_ENABLE !== "false"
    ) {
      if (isGreeting) {
        const greeted = await handleHello(message, lang);
        if (greeted === false) {
          discordLog(
            "debug",
            "messageCreate:bot-reply-or-name+greeting-cooldown+ai",
            {
              userId: message.author.id,
              channelId: message.channelId,
            },
          );
          await handleAI(message);
        }
      } else {
        discordLog("debug", "messageCreate:bot-reply-or-name+ai", {
          userId: message.author.id,
          channelId: message.channelId,
          isBotReply,
          isBotNameMentioned,
        });
        await handleAI(message);
      }
      return;
    }

    // No mention — standalone greeting.
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
