require("dotenv").config({ debug: false });
const { Client, GatewayIntentBits } = require("discord.js");
const { getValidTwitchConfig } = require("./utils/twitchToken");
const bootstrap = require("./handlers/discord/startup").bootstrap;
const twitchLog = require("./utils/loggers").twitchLog;
const { initialize: dbInitialize } = require("./db/database");
const ComfyJS = require("comfy.js");

let discordClient;
let twitchClient;

(async () => {
  // Initialize the database
  await dbInitialize();

  // Initialize Discord client
  discordClient = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  });

  await discordClient.login(process.env.DISCORD_TOKEN);

  // Bootstrap Discord client to register commands and event handlers
  await bootstrap(discordClient);

  // Obtain valid Twitch tokens before initializing ComfyJS
  const twitchConfig = await getValidTwitchConfig();

  // Create the onConnected handler for twitch bot
  ComfyJS.onConnected = (address, port) => {
    twitchLog("info", `Twitch client authenticated and ready at ${address}:${port}`);
  };

  // Initialize the bot
  ComfyJS.Init(process.env.TWITCH_USERNAME, `oauth:${twitchConfig.ACCESS_TOKEN}`, process.env.TWITCH_CHANNEL);

  twitchClient = ComfyJS;

  module.exports = {
    discordClient,
    twitchClient,
  };
})();
