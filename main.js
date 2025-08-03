const { Client, GatewayIntentBits, Collection } = require("discord.js");
const twitch = require("tmi.js");
const dotenv = require("dotenv");
const registerEvents = require("./handlers/events.js");
const registerCommands = require("./handlers/commands.js");
const fs = require("fs");
const path = require("path");
const { systemLogger } = require("./loggers/index");

dotenv.config();

const logDirectory = path.resolve("./logs");
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory);
}

const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});



discordClient.commands = new Collection();

registerEvents(discordClient, systemLogger);
registerCommands(discordClient, systemLogger);

discordClient.login(process.env.GALAYAKI_TOKEN).catch((error) => {
  systemLogger.error("Error connecting the bot:", error);
});
