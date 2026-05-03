/**
 * @module messages/discord/msgHello
 * @description
 * Discord-side greeting handler. Picks a localised template at random from
 * `data/resources.json`, substitutes user/emoji placeholders, sends it as a reply
 * to the original message and bumps the user's greeting cooldown via
 * {@link module:db/greetings.updateGreeting}. Greetings within
 * {@link GREETING_COOLDOWN_MS} of the previous one are skipped.
 */

"use strict";

const resources = require("../../data/resources.json");
const emojis = require("../../data/emojis.json");
const { discordLog } = require("../../utils/loggers");
const { getLastGreeting, updateGreeting } = require("../../db/greetings");
const { GREETING_COOLDOWN_MS } = require("../../utils/constants");

/**
 * Reply to a greeting message if the user is past the cooldown window.
 *
 * @async
 * @param {import('discord.js').Message} message - The user's incoming greeting message.
 * @param {("en"|"es")} lang - Language resolved from the channel (see {@link module:utils/language}).
 * @returns {Promise<void>}
 */
async function handleHello(message, lang) {
  discordLog("debug", "msgHello:handleHello", {
    userId: message.author.id,
    channelId: message.channelId,
    lang,
  });

  const lastGreeting = await getLastGreeting(message.author.id);

  if (
    lastGreeting &&
    new Date(lastGreeting.timestamp).getTime() >
      Date.now() - GREETING_COOLDOWN_MS
  ) {
    discordLog("info", "msgHello:cooldown skip", {
      userId: message.author.id,
      username: message.author.username,
      lastGreeting: lastGreeting.timestamp,
    });
    return;
  }

  const userName = message.member?.displayName || message.author.username;
  const userMention = `<@${message.author.id}>`;

  const greetings = resources[lang].greetingResponses.map((greeting) => {
    let replacedGreeting = greeting
      .replace("{userName}", userName)
      .replace("{userMention}", userMention);
    for (const emojiName in emojis) {
      const regex = new RegExp(`\\{emojis\\.${emojiName}\\}`, "g");
      replacedGreeting = replacedGreeting.replace(regex, emojis[emojiName]);
    }
    return replacedGreeting;
  });

  const randomGreeting =
    greetings[Math.floor(Math.random() * greetings.length)];

  try {
    await message.reply(randomGreeting);
    const timestamp = new Date().toISOString();
    await updateGreeting(message.author.id, timestamp);
    discordLog("info", "msgHello:replied", {
      userId: message.author.id,
      username: message.author.username,
    });
  } catch (error) {
    discordLog("error", "msgHello:reply failed", {
      userId: message.author.id,
      err: error.message,
      stack: error.stack,
    });
  }
}

module.exports = { handleHello };
