const twitchLog = require("../../utils/loggers").twitchLog;

module.exports = async function (eventData, clientManager) {
  if (eventData.self) return;

  const { message, channel, user } = eventData;
  const { twitchChatClient } = clientManager;

  const prefix = message.content.startsWith("g!") ? "g!" : "!";
  const commandBody = message.content.slice(prefix.length).trim();
  const args = commandBody.split(/\s+/);
  const commandName = args.shift().toLowerCase();

  if (commandName === "ping") {
    await twitchChatClient.say(channel, `@${user.displayName}, Pong!`);
    twitchLog("info", `Comando !ping ejecutado por ${user.name}`);
  }
};
