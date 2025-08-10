const resources = require("../../data/resources.json");
const twitchLog = require("../../utils/loggers").twitchLog;
const { getLastGreeting, updateGreeting } = require("../../db/greetings");

module.exports = async function (user, message, flags, self, extra, client) {
  const userName = user;
  const userMention = `@${userName}`;
  const userId = extra && extra.userId ? extra.userId : null;

  // Check if the user has been greeted recently
  if (userId) {
    const lastGreeting = await getLastGreeting(userId);
    if (lastGreeting && new Date(lastGreeting.timestamp).getTime() > Date.now() - 4 * 60 * 60 * 1000) {
      twitchLog("info", `El usuario ${userName} (${userId}) ya fue saludado recientemente en Twitch.`);
      return;
    }
  }

  // Prepare the greeting response
  const greetings = resources.greetingResponses.map((greeting) => {
    // Replace placeholders with user information
    let replacedGreeting = greeting
      .replace("{userName}", userName)
      .replace("{userMention}", userMention)
      .replace(/\{emojis\.[^}]+\}/g, "");

    return replacedGreeting;
  });

  // Get a random greeting from the list
  const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];

  try {
    const channelName = extra && extra.channel ? extra.channel.toLowerCase() : undefined;
    // Send the greeting message to the Twitch chat
    await client.Say(randomGreeting, channelName);
    if (userId) {
      const timestamp = new Date().toISOString();
      await updateGreeting(userId, timestamp);
    }
    twitchLog("info", `Saludo enviado a ${userName} en Twitch.`);
  } catch (error) {
    twitchLog("error", `No se pudo enviar el saludo en Twitch: ${error.message}`);
  }
};
