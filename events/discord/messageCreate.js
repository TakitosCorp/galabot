const msgHello = require("../../messages/discord/msgHello");
const greetings = require("../../data/resources.json").greetings;

module.exports = {
  name: "messageCreate",
  async execute(message, client) {
    // Ignore self messages and bot messages
    if (message.author.bot) return;

    // Handle greetings (match whole words only)
    const content = message.content.toLowerCase();
    if (greetings.some(greet => new RegExp(`\\b${greet}\\b`, 'i').test(content))) {
      await msgHello(message, client);
    }
  },
  once: false,
};
