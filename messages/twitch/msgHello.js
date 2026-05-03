/**
 * @module messages/twitch/msgHello
 * @description
 * Twitch-side greeting handler. Mirrors {@link module:messages/discord/msgHello}
 * but writes back to Twitch chat via Twurple's `say()` and respects the same
 * cross-platform greeting cooldown stored in the `greetings` table.
 */

"use strict";

const { twitchLog } = require("../../utils/loggers");
const resources = require("../../data/resources.json");
const { getLastGreeting, updateGreeting } = require("../../db/greetings");
const { GREETING_COOLDOWN_MS } = require("../../utils/constants");

/**
 * Send a greeting reply in Twitch chat if the user is past the cooldown window.
 *
 * @async
 * @param {import('../../utils/types').TwitchEventData} eventData
 * @param {import('../../clientManager')} clientManager
 * @returns {Promise<void>}
 */
async function handleHello(eventData, clientManager) {
  const { user, channel } = eventData;
  const { twitchChatClient } = clientManager;

  twitchLog("debug", "twitch:msgHello handleHello", {
    user: user.name,
    userId: user.id,
    channel,
  });

  const lastGreeting = await getLastGreeting(user.id);
  if (
    lastGreeting &&
    new Date(lastGreeting.timestamp).getTime() >
      Date.now() - GREETING_COOLDOWN_MS
  ) {
    twitchLog("info", "twitch:msgHello cooldown skip", {
      user: user.name,
      userId: user.id,
      lastGreeting: lastGreeting.timestamp,
    });
    return;
  }

  const userMention = `@${user.displayName || user.name}`;
  const greetingResponses = resources.en.greetingResponses || [];

  const greetings = greetingResponses
    .filter(
      (greeting) => typeof greeting === "string" && greeting.trim().length > 0,
    )
    .map((greeting) => {
      return greeting
        .replace("{userName}", user.name)
        .replace("{userMention}", userMention)
        .replace(/\{emojis\.[^}]+\}/g, "");
    });

  const randomGreeting =
    greetings.length > 0
      ? greetings[Math.floor(Math.random() * greetings.length)]
      : `Hey ${userMention}! Welcome to the channel!`;

  try {
    await twitchChatClient.say(channel, randomGreeting);
    await updateGreeting(user.id, new Date().toISOString());
    twitchLog("info", "twitch:msgHello sent", {
      user: user.name,
      userId: user.id,
    });
  } catch (error) {
    twitchLog("error", "twitch:msgHello failed", {
      user: user.name,
      err: error.message,
      stack: error.stack,
    });
  }
}

module.exports = { handleHello };
