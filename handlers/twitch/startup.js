const { getValidTwitchConfig } = require("../../utils/twitchToken");
const twitchLog = require("../../utils/loggers").twitchLog;
const interactionCreate = require("../../events/twitch/interactionCreate");
const messageCreate = require("../../events/twitch/messageCreate");
const { ChatClient } = require("@twurple/chat");
const { StaticAuthProvider } = require("@twurple/auth");

// Bootstrap the Twitch client by registering events and initializing the connection
async function bootstrap() {
  const twitchConfig = await getValidTwitchConfig();
  const username = process.env.TWITCH_USERNAME;
  let channel = process.env.TWITCH_CHANNEL;

  const authProvider = new StaticAuthProvider(twitchConfig.CLIENT_ID, twitchConfig.ACCESS_TOKEN);
  const chatClient = new ChatClient({ authProvider, channels: [channel] });

  chatClient.onConnect(() => {
    twitchLog("info", `Twitch client authenticated and ready as ${username}`);
  });

  chatClient.onMessage(async (channel, user, message, msg) => {
    // Extract all available information from the message
    const eventData = {
      channel: channel,
      user: {
        name: user,
        id: msg.userInfo.userId,
        displayName: msg.userInfo.displayName,
      },
      message: {
        content: message,
        id: msg.id,
        isCheer: msg.isCheer,
        bits: msg.bits || 0,
        emotes: msg.emotes,
      },
      flags: {
        mod: msg.userInfo.isMod,
        broadcaster: msg.userInfo.isBroadcaster,
        subscriber: msg.userInfo.isSubscriber,
        vip: msg.userInfo.isVip,
        founder: msg.userInfo.isFounder,
        staff: msg.userInfo.isStaff,
      },
      timestamp: new Date(),
      rawData: msg,
    };

    // Route to appropriate handler
    if (message.startsWith("!") || message.startsWith("g!")) {
      await interactionCreate(eventData, chatClient);
    } else {
      await messageCreate(eventData, chatClient);
    }
  });

  await chatClient.connect();
}

module.exports = { bootstrap };
