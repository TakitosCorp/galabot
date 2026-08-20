/**
 * @module events/twitch/messageCreate
 * @description
 * Handles non-command Twitch chat messages. Currently used to detect greetings
 * and trigger the platform-specific greeting reply. Self-authored messages are
 * ignored (we never want the bot to greet itself).
 */

import { twitchLog } from "../../utils/core/loggers.js";
import resources from "../../data/resources.json" with { type: "json" };
import { handleHello } from "../../messages/twitch/msgHello.js";

/**
 * @async
 * @param {import('../../utils/core/types.js').TwitchEventData} eventData
 * @param {import('../../handlers/clientManager.js')} clientManager
 * @returns {Promise<void>}
 */
export default async function (eventData, clientManager) {
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
}
