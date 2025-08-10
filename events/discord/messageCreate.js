const msgHello = require("../../messages/discord/msgHello");
const msgPing = require("../../messages/discord/msgPing");
const greetings = require("../../data/resources.json").greetings;

module.exports = {
  name: "messageCreate",
  async execute(message, client) {
    // Ignore self messages and bot messages
    if (message.author.bot) return;

    // Handle pings to Gala
    if (message.content.includes("<@1080658502177001562>") && !message.author.bot) {
      msgPing(message, client);
    }

    // Handle greetings (match whole words only)
    const content = message.content.toLowerCase();
    if (greetings.some((greet) => new RegExp(`\\b${greet}\\b`, "i").test(content))) {
      await msgHello(message, client);
    }
  },
  once: false,
};
