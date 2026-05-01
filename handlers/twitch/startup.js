const twitchLog = require("../../utils/loggers").twitchLog;
const streamStartHandler = require("../../events/twitch/streamStart");
const streamEndHandler = require("../../events/twitch/streamEnd");
const messageHandler = require("../../events/twitch/messageCreate");
const interactionHandler = require("../../events/twitch/interactionCreate");
const { createEventData } = require("./eventData");

async function bootstrap(clientManager) {
  const { twitchChatClient, twitchApiClient, twitchEventSubListener } = clientManager;
  const channelName = process.env.TWITCH_CHANNEL;
  const username = process.env.TWITCH_USERNAME;

  twitchChatClient.onConnect(() => {
    twitchLog("info", `Twitch chat client connected as ${username}`);
  });

  twitchChatClient.onDisconnect((manually, reason) => {
    const reasonMsg = reason ? `${reason.message || "No message"} (${reason.name})` : "Unknown reason";
    twitchLog(
      "warn",
      `Twitch client disconnected: ${manually ? "Manually" : "Automatically"} - Reason: ${reasonMsg}`
    );
    if (!manually) {
      twitchLog("info", "Client will attempt to reconnect automatically...");
    }
  });

  twitchChatClient.onMessage(async (channel, user, message, msg) => {
    const eventData = createEventData(channel, user, message, msg);
    if (message.startsWith("!") || message.startsWith("g!")) {
      await interactionHandler(eventData, clientManager);
    } else {
      await messageHandler(eventData, clientManager);
    }
  });

  try {
    const user = await twitchApiClient.users.getUserByName(channelName.replace("#", ""));
    if (user) {
      twitchEventSubListener.onStreamOnline(user.id, (event) => {
        streamStartHandler(event, clientManager);
      });

      twitchEventSubListener.onStreamOffline(user.id, (event) => {
        twitchLog("info", `Stream for ${event.broadcasterDisplayName} has ended.`);
        streamEndHandler(event, clientManager);
      });

      twitchLog("info", `EventSub subscribed to events for ${user.displayName}.`);
    } else {
      twitchLog("error", `Could not find Twitch user: ${channelName}`);
    }
  } catch (error) {
    twitchLog("error", `Error setting up EventSub listeners: ${error.message}`);
  }

  twitchLog("info", "Twitch bootstrap complete.");
}

module.exports = { bootstrap };
