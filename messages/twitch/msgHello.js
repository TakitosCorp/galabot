const { twitchLog } = require("../../utils/loggers");
const resources = require("../../data/resources.json");
const { getLastGreeting, updateGreeting } = require("../../db/greetings");
const { GREETING_COOLDOWN_MS } = require("../../utils/constants");

async function handleHello(eventData, clientManager) {
  const { user, channel } = eventData;
  const { twitchChatClient } = clientManager;

  const lastGreeting = await getLastGreeting(user.id);
  if (lastGreeting && new Date(lastGreeting.timestamp).getTime() > Date.now() - GREETING_COOLDOWN_MS) {
    twitchLog("info", `User ${user.name} (${user.id}) was greeted recently on Twitch, skipping.`);
    return;
  }

  const userMention = `@${user.displayName || user.name}`;
  const greetingResponses = resources.en.greetingResponses || [];

  const greetings = greetingResponses
    .filter((greeting) => typeof greeting === "string" && greeting.trim().length > 0)
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
    twitchLog("info", `Greeting sent to ${user.name} on Twitch.`);
  } catch (error) {
    twitchLog("error", `Failed to send greeting on Twitch: ${error.message}`);
  }
}

module.exports = { handleHello };
