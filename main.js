// Disable the debug logs to prevent clutter in the console from Comfy.js
console.debug = () => {};

require("dotenv").config({ debug: false });
const { Client, GatewayIntentBits } = require("discord.js");
const bootstrapDiscord = require("./handlers/discord/startup").bootstrap;
const bootstrapTwitch = require("./handlers/twitch/startup").bootstrap;
const { initialize: dbInitialize } = require("./db/database");

let discordClient;

(async () => {
  await dbInitialize();

  // Initialize Discord client
  discordClient = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  });

  // Login to Discord
  await discordClient.login(process.env.DISCORD_TOKEN);

  // Bootstrap Discord client
  await bootstrapDiscord(discordClient);

  // Create and bootstrap Twitch client
  await bootstrapTwitch();

  module.exports = {
    discordClient,
  };
})();
