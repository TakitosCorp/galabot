const emojis = require("../../data/emojis.json");
const resources = require("../../data/resources.json");
const discordLog = require("../../utils/loggers").discordLog;

module.exports = async function (message, client) {
  const userName = message.member?.displayName || message.author.username;
  const userMention = `<@${message.author.id}>`;

  // Prepare the greeting response
  const greetings = resources.greetingResponses.map((greeting) => {
    let replacedGreeting = greeting.replace("{userName}", userName).replace("{userMention}", userMention);

    for (const emojiName in emojis) {
      replacedGreeting = replacedGreeting.replace(`{emojis.${emojiName}}`, emojis[emojiName]);
    }
    return replacedGreeting;
  });

  // Select a random greeting from the list
  const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];

  try {
    await message.reply(randomGreeting);
  } catch (error) {
    discordLog("error", `Failed to send greeting message: ${error.message}`);
  }
};
