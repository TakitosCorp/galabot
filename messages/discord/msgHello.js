const resources = require("../../data/resources.json");
const emojis = require("../../data/emojis.json");
const { discordLog } = require("../../utils/loggers");
const { getLastGreeting, updateGreeting } = require("../../db/greetings");

async function handleHello(message) {
  const lastGreeting = await getLastGreeting(message.author.id);

  if (lastGreeting && new Date(lastGreeting.timestamp).getTime() > Date.now() - 4 * 60 * 60 * 1000) {
    discordLog("info", `User ${message.author.username} (${message.author.id}) ya fue saludado recientemente.`);
    return;
  }

  const userName = message.member?.displayName || message.author.username;
  const userMention = `<@${message.author.id}>`;

  const greetings = resources.greetingResponses.map((greeting) => {
    let replacedGreeting = greeting.replace("{userName}", userName).replace("{userMention}", userMention);
    for (const emojiName in emojis) {
      const regex = new RegExp(`\\{emojis\\.${emojiName}\\}`, "g");
      replacedGreeting = replacedGreeting.replace(regex, emojis[emojiName]);
    }
    return replacedGreeting;
  });

  const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];

  try {
    await message.reply(randomGreeting);
    const timestamp = new Date().toISOString();
    await updateGreeting(message.author.id, timestamp);
  } catch (error) {
    discordLog("error", `Fallo al enviar el saludo: ${error.message}`);
  }
}

module.exports = { handleHello };
