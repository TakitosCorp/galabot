const resources = require("../../data/resources.json");
const { handleHello } = require("../../messages/discord/msgHello");
const { handlePing } = require("../../messages/discord/msgPing");
const { getLanguage } = require("../../utils/language");

module.exports = {
  name: "messageCreate",
  async execute(message, client, clientManager) {
    if (message.author.bot || !message.guild) return;

    const lang = getLanguage(message.channelId);

    if (message.content.includes(`<@${process.env.GALA_DISCORD_ID}>`)) {
      await handlePing(message, lang);
      return;
    }

    const content = message.content.toLowerCase().trim();
    const isGreeting = resources[lang].greetings.some(
      (greet) =>
        new RegExp(`^${greet}$`, "i").test(content) ||
        new RegExp(`\\b${greet}\\b`, "i").test(content),
    );

    if (isGreeting) {
      await handleHello(message, lang);
    }
  },
  once: false,
};
