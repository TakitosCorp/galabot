const ComfyJS = require("comfy.js");
const { getValidTwitchConfig } = require("../../utils/twitchToken");
const twitchLog = require("../../utils/loggers").twitchLog;
const interactionCreate = require("../../events/twitch/interactionCreate");
const messageCreate = require("../../events/twitch/messageCreate");

// Boostrap the Twitch client by registering events and initializing the connection
async function bootstrap() {
  // Get valid Twitch configuration and login tokens
  const twitchConfig = await getValidTwitchConfig();

  // Define the event handler for the connection
  ComfyJS.onConnected = async (address, port) => {
    twitchLog("info", `Twitch client authenticated and ready at ${address}:${port}`);
  };

  // Handle the chat messages
  ComfyJS.onChat = async (user, message, flags, self, extra) => {
    if (message.startsWith("!") || message.startsWith("g!")) {
      await interactionCreate(user, message, flags, self, extra, ComfyJS);
    } else {
      await messageCreate(user, message, flags, self, extra, ComfyJS);
    }
  };

  // Initialize the Twitch client with the username, access token, and channel
  await ComfyJS.Init(process.env.TWITCH_USERNAME, `oauth:${twitchConfig.ACCESS_TOKEN}`, process.env.TWITCH_CHANNEL, false);
}

module.exports = { bootstrap };
