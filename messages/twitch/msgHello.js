const resources = require("../../data/resources.json");
const twitchLog = require("../../utils/loggers").twitchLog;
const { getLastGreeting, updateGreeting } = require("../../db/greetings");

module.exports = async function (userName, extra, client) {
  const userMention = `@${extra.displayName || userName}`;
  const userId = extra && extra.userId ? extra.userId : null;

  // Check if the user has been greeted recently
  if (userId) {
    const lastGreeting = await getLastGreeting(userId);
    if (lastGreeting && new Date(lastGreeting.timestamp).getTime() > Date.now() - 4 * 60 * 60 * 1000) {
      twitchLog("info", `User ${userName} (${userId}) was already greeted recently on Twitch.`);
      return;
    }
  }

  // Prepare the greeting response
  const greetingResponses = Array.isArray(resources.greetingResponses) ? resources.greetingResponses : [];
  const greetings = greetingResponses
    .filter((greeting) => typeof greeting === "string" && greeting.trim().length > 0)
    .map((greeting) => {
      let replacedGreeting = greeting
        .replace("{userName}", userName)
        .replace("{userMention}", userMention)
        .replace(/\{emojis\.[^}]+\}/g, "");

      return replacedGreeting;
    });

  // Get a random greeting from the list
  const randomGreeting =
    greetings.length > 0
      ? greetings[Math.floor(Math.random() * greetings.length)]
      : `Hello ${userMention}! Welcome to the channel.`;

  try {
    let channelName = extra && extra.channel ? extra.channel : undefined;
    if (!channelName) {
      twitchLog("error", "Could not send greeting on Twitch: channelName is undefined");
      return;
    }

    console.log(`Sending greeting to ${userName} on Twitch: ${randomGreeting}`);

    await client.say(channelName, randomGreeting);
    if (userId) {
      const timestamp = new Date().toISOString();
      await updateGreeting(userId, timestamp);
    }
    twitchLog("info", `Greeting sent to ${userName} on Twitch.`);
  } catch (error) {
    twitchLog("error", `Could not send greeting on Twitch: ${error.message}`);
  }
};
