const twitchLog = require("../../utils/loggers").twitchLog;

/**
 * Handles command interactions from Twitch chat
 * @param {Object} eventData - All data about the event
 * @param {Object} client - The Twitch chat client
 */
module.exports = async function (eventData, client) {
  // Ignore self messages
  if (eventData.self) return;

  const { message, channel, user } = eventData;

  // Parse command and arguments
  const commandBody = message.content.startsWith("g!")
    ? message.content.slice(2).trim()
    : message.content.slice(1).trim();

  const args = commandBody.split(/\s+/);
  const commandName = args.shift().toLowerCase();
};
