const twitchLog = require("../../utils/loggers").twitchLog;
const greetings = require("../../data/resources.json").greetings;
const handleHello = require("../../messages/twitch/msgHello");

/**
 * Handles regular messages from Twitch chat
 * @param {Object} eventData - All data about the event
 * @param {Object} client - The Twitch chat client
 */
module.exports = async function (eventData, client) {
  // Ignore self messages
  if (eventData.self) return;

  const { message, channel, user, flags } = eventData;

  // Process message content
  const content = message.content.toLowerCase();

  // Check for greetings
  const isGreeting = greetings.some((greeting) => content.includes(greeting.toLowerCase()));

  if (isGreeting) {
    await handleHello(
      user.name,
      {
        userId: user.id,
        channel: channel,
        displayName: user.displayName || user.name,
      },
      client
    );
    return;
  }
};
