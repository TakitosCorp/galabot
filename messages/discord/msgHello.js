const emojis = require("../../data/emojis.json");
const resources = require("../../data/resources.json");
const discordLog = require("../../utils/loggers").discordLog;
const { getLastGreeting, updateGreeting } = require("../../db/greetings");

module.exports = async function (message, client) {
  const lastGreeting = await getLastGreeting(message.author.id);

  // We check if the user has been greeted in the last 4 hours
  if (lastGreeting && new Date(lastGreeting.timestamp).getTime() > Date.now() - 4 * 60 * 60 * 1000) {
    discordLog("info", `User ${message.author.username} (${message.author.id}) has already been greeted recently.`);
    return;
  }

  const userName = message.member?.displayName || message.author.username;
  const userMention = `<@${message.author.id}>`;

  // Prepare the greeting response
  const greetings = resources.greetingResponses.map((greeting) => {
    let replacedGreeting = greeting.replace("{userName}", userName).replace("{userMention}", userMention);

    for (const emojiName in emojis) {
      const regex = new RegExp(`\\{emojis\\.${emojiName}\\}`, "g");
      replacedGreeting = replacedGreeting.replace(regex, emojis[emojiName]);
    }
    return replacedGreeting;
  });

  // Select a random greeting from the list
  const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];

  try {
    await message.reply(randomGreeting);
    const timestamp = new Date().toISOString();
    await updateGreeting(message.author.id, timestamp);
  } catch (error) {
    discordLog("error", `Failed to send greeting message: ${error.message}`);
  }
};
