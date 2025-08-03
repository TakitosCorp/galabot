const { handlePing } = require("../messages/handlePing");
const { handleHello } = require("../messages/handleHello");
const resources = require("../data/resources.json");

module.exports = async (discordClient, message, logger) => {
  if (message.content.includes("<@1080658502177001562>") && !message.author.bot) {
    await handlePing(message, logger);
  }

  const saludoRegex = new RegExp(`\\b(${resources.saludos.join("|")}){1,5}\\b`, "i");

  if (
    !message.author.bot &&
    saludoRegex.test(message.content.trim()) &&
    !message.mentions.users.size
  ) {
    await handleHello(message, logger);
  }
};
