const { twitchLog } = require("../../utils/loggers");
const resources = require("../../data/resources.json");
const { handleHello } = require("../../messages/twitch/msgHello");

module.exports = async function (eventData, clientManager) {
  if (eventData.self) return;

  const content = eventData.message.content.toLowerCase().trim();
  const isGreeting = resources.greetings.some(
    (greeting) => new RegExp(`^${greeting}$`, "i").test(content) || new RegExp(`\\b${greeting}\\b`, "i").test(content)
  );

  if (isGreeting) {
    await handleHello(eventData, clientManager);
  }
};
