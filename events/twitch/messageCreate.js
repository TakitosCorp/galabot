/**
 * @module events/twitch/messageCreate
 * @description
 * Handles non-command Twitch chat messages. Currently used to detect greetings
 * and trigger the platform-specific greeting reply. Self-authored messages are
 * ignored (we never want the bot to greet itself).
 */

"use strict";

const { twitchLog } = require("../../utils/loggers");
const resources = require("../../data/resources.json");
const { handleHello } = require("../../messages/twitch/msgHello");

/**
 * @async
 * @param {import('../../utils/types').TwitchEventData} eventData
 * @param {import('../../clientManager')} clientManager
 * @returns {Promise<void>}
 */
module.exports = async function (eventData, clientManager) {
  if (eventData.self) return;

  const content = eventData.message.content.toLowerCase().trim();
  const isGreeting = resources.en.greetings.some(
    (greeting) =>
      new RegExp(`^${greeting}$`, "i").test(content) ||
      new RegExp(`\\b${greeting}\\b`, "i").test(content),
  );

  if (isGreeting) {
    twitchLog("debug", "twitch:messageCreate greeting matched", {
      user: eventData.user.name,
      userId: eventData.user.id,
      channel: eventData.channel,
    });
    await handleHello(eventData, clientManager);
  }
};
