const emojis = require("../data/emojis.json");
const resources = require("../data/resources.json");
const { readJSON, writeJSON, getFilePath } = require("../utils/fileUtils.js");

const LAST_GREETING_TIMES_FILE = getFilePath("lastGreetingTimes.json");
const COOLDOWN_HOURS = 1;

async function handleHello(discordClient, message, logger) {
  const userId = message.author.id;
  const userName = message.author.username;
  const userMention = `<@${message.author.id}>`;

  let lastGreetingTimes = readJSON(LAST_GREETING_TIMES_FILE, {});
  const lastGreetingTime = lastGreetingTimes[userId];
  const now = Date.now();

  if (lastGreetingTime && now - lastGreetingTime < COOLDOWN_HOURS * 60 * 60 * 1000) {
    return;
  }

  const greetings = resources.greetings.map((greeting) => {
    let replacedGreeting = greeting.replace("{userName}", userName).replace("{userMention}", userMention);

    for (const emojiName in emojis) {
      replacedGreeting = replacedGreeting.replace(`{emojis.${emojiName}}`, emojis[emojiName]);
    }

    return replacedGreeting;
  });

  const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];

  try {
    await message.reply(randomGreeting);
    lastGreetingTimes[userId] = now;
    writeJSON(LAST_GREETING_TIMES_FILE, lastGreetingTimes);
  } catch (error) {
    logger.error("Error al responder al saludo:", error);
  }
}

module.exports = { handleHello };
