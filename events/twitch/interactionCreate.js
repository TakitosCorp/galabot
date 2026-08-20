/**
 * @module events/twitch/interactionCreate
 * @description
 * Handles Twitch chat commands prefixed with `!` or `g!`. Currently implements
 * just `!ping` (and the `g!`-prefixed variant), which echoes a `Pong!` response
 * back to the requesting user.
 */

import { twitchLog } from "../../utils/core/loggers.js";

/**
 * @async
 * @param {import('../../utils/core/types.js').TwitchEventData} eventData
 * @param {import('../../handlers/clientManager.js')} clientManager
 * @returns {Promise<void>}
 */
export default async function (eventData, clientManager) {
  if (eventData.self) return;

  const { message, channel, user } = eventData;
  const { twitchChatClient } = clientManager;

  const prefix = message.content.startsWith("g!") ? "g!" : "!";
  const commandBody = message.content.slice(prefix.length).trim();
  const args = commandBody.split(/\s+/);
  const commandName = args.shift().toLowerCase();

  twitchLog("debug", "twitch:interaction parsed", {
    prefix,
    commandName,
    user: user.name,
    channel,
  });

  if (commandName === "ping") {
    try {
      await twitchChatClient.say(channel, `@${user.displayName}, Pong!`);
      twitchLog("info", "twitch:command !ping", {
        user: user.name,
        channel,
      });
    } catch (err) {
      twitchLog("error", "twitch:command !ping failed", {
        user: user.name,
        err: err.message,
        stack: err.stack,
      });
    }
  }
}
