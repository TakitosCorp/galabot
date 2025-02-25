const { Client, GatewayIntentBits, Collection } = require("discord.js");
const dotenv = require("dotenv");
const registerEvents = require("./handlers/events.js");
const registerCommands = require("./handlers/commands.js");
const fs = require("fs");
const path = require("path");
const pino = require("pino");

dotenv.config();

const logDirectory = path.resolve("./logs");
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory);
}

const logger = pino({
  transport: {
    targets: [
      {
        target: "pino-pretty",
        options: { colorize: true },
      },
      {
        target: "pino/file",
        options: { destination: `${logDirectory}/bot.log` },
      },
    ],
  },
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection();

registerEvents(client, logger);
registerCommands(client, logger);

client.login(process.env.GALAYAKI_TOKEN).catch((error) => {
  logger.error("Error al conectar el bot:", error);
});
