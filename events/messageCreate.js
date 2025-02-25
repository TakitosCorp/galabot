const { handlePing } = require("../messages/handlePing");
const { handleHello } = require("../messages/handleHello");

module.exports = async (client, message, logger) => {
  if (message.content.includes("<@1080658502177001562>") && !message.author.bot) {
    await handlePing(message, logger);
  }

  if (
    !message.author.bot &&
    /\b(hola{1,5}|hello{1,5}|hi{1,5}|holi{1,5}|buenas{1,5}|saludos{1,5}|holiwi{1,5}|holis{1,5})\b/i.test(message.content.trim()) &&
    !message.mentions.users.size
  ) {
    await handleHello(message, logger);
  }
};
