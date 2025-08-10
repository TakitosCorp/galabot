const msgHello = require("../../messages/twitch/msgHello");
const greetings = require("../../data/resources.json").greetings;

module.exports = async function (user, message, flags, self, extra, client) {
  // Ignore self messages
  if (self) return;

  // Handle greetings
  const content = message.toLowerCase();
  if (greetings.some((greet) => new RegExp(`\\b${greet}\\b`, "i").test(content))) {
    await msgHello(user, message, flags, self, extra, client);
  }
};
