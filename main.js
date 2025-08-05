require("dotenv").config({ debug: false });
const { Client, GatewayIntentBits } = require("discord.js");
const tmi = require("tmi.js");
const { getValidTwitchConfig } = require("./utils/twitchToken");
const bootstrap = require("./handlers/discord/startup").bootstrap;
const twitchLog = require("./utils/loggers").twitchLog;
const { initialize: dbInitialize } = require("./db/database");

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

  // Get the valid Twitch tokens before initializing the Twitch client
  const twitchConfig = await getValidTwitchConfig();

  // Initialize Twitch client
  twitchClient = new tmi.Client({
    options: { debug: true },
    identity: {
      username: process.env.TWITCH_USERNAME,
      password: `oauth:${twitchConfig.ACCESS_TOKEN}`,
    },
    channels: [process.env.TWITCH_CHANNEL || "canal"],
  });

  twitchClient.on("connected", (address, port) => {
    twitchLog("info", `Twitch client authenticated and ready at ${address}:${port}`);
  });
  await twitchClient.connect();

  module.exports = {
    discordClient,
    twitchClient,
  };
})();
