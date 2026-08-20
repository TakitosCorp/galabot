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
 * @typedef {import('../../utils/core/types').DiscordEventHandler} DiscordEventHandler
 */

import { PermissionFlagsBits } from "discord.js";
import axios from "axios";
import resources from "../../data/resources.json" with { type: "json" };
import { handleHello } from "../../messages/discord/msgHello.js";
import { handlePing } from "../../messages/discord/msgPing.js";
import { handleAI } from "../../messages/discord/msgAI.js";
import { getLanguage } from "../../utils/core/language.js";
import { discordLog } from "../../utils/core/loggers.js";
import { getAllScamHashes } from "../../db/scamHashes.js";
import { computeHash, isSimilar } from "../../utils/discord/imageHash.js";

/**
 * Download, hash, and compare every image attachment against registered scam hashes.
 * Deletes the message and bans the author if a match is found.
 *
 * @async
 * @param {import('discord.js').Message} message
 * @returns {Promise<boolean>} true when a scam was detected and action was taken.
 */
async function handleScamImageCheck(message) {
  const imageAttachments = [...message.attachments.values()].filter((a) =>
    a.contentType?.startsWith("image/"),
  );
  if (imageAttachments.length === 0) return false;

  let knownHashes;
  try {
    knownHashes = await getAllScamHashes();
  } catch (err) {
    discordLog("error", "messageCreate:scam-check db failed", {
      err: err.message,
    });
    return false;
  }
  if (knownHashes.length === 0) return false;

  for (const att of imageAttachments) {
    let buffer;
    try {
      const response = await axios.get(att.url, {
        responseType: "arraybuffer",
      });
      buffer = Buffer.from(response.data);
    } catch (err) {
      discordLog("warn", "messageCreate:scam-check download failed", {
        url: att.url,
        err: err.message,
      });
      continue;
    }

    let hash;
    try {
      hash = await computeHash(buffer);
    } catch (err) {
      discordLog("warn", "messageCreate:scam-check hash failed", {
        err: err.message,
      });
      continue;
    }

    const matched = knownHashes.find((row) => isSimilar(row.hash, hash));
    if (!matched) continue;

    discordLog("info", "messageCreate:scam-detected", {
      userId: message.author.id,
      username: message.author.username,
      channelId: message.channelId,
      matchedHashId: matched.id,
    });

    try {
      await message.delete();
    } catch (err) {
      discordLog("warn", "messageCreate:scam-delete failed", {
        err: err.message,
      });
    }

    const member = message.member;
    if (!member || member.permissions.has(PermissionFlagsBits.Administrator)) {
      discordLog("warn", "messageCreate:scam-skip-ban", {
        userId: message.author.id,
        reason: !member ? "no member" : "is admin",
      });
      return true;
    }

    if (
      message.guild.members.me?.permissions.has(PermissionFlagsBits.BanMembers)
    ) {
      try {
        await member.ban({ reason: "Scam detected: known scam image." });
        discordLog("info", "messageCreate:scam-banned", {
          userId: message.author.id,
          username: message.author.username,
        });
      } catch (err) {
        discordLog("error", "messageCreate:scam-ban failed", {
          userId: message.author.id,
          err: err.message,
          stack: err.stack,
        });
      }
    } else {
      discordLog("warn", "messageCreate:scam-no-ban-perms", {
        userId: message.author.id,
      });
    }

    return true;
  }

  return false;
}

/** @type {DiscordEventHandler} */
export const name = "messageCreate";
export const once = false;

/**
 * @async
 * @param {import('discord.js').Message} message - Incoming Discord message.
 * @param {import('discord.js').Client} client - Gateway client (used to resolve the bot's own user id).
 * @returns {Promise<void>}
 */
export async function execute(message, client) {
  if (message.author.bot || !message.guild) return;

  if (message.attachments.size > 0) {
    const scamDetected = await handleScamImageCheck(message);
    if (scamDetected) return;
  }

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
}
