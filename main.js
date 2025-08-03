const { Client, GatewayIntentBits, Collection } = require("discord.js");
const tmi = require("tmi.js");
const dotenv = require("dotenv");
const registerEvents = require("./handlers/events.js");
const registerCommands = require("./handlers/commands.js");
const fs = require("fs");
const path = require("path");
const { systemLogger } = require("./loggers/index");
const { getValidTwitchConfig } = require("./utils/twitch");

dotenv.config();

async function main() {
  const logDirectory = path.resolve("./logs");
  if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory);
  }

  const dataDirectory = path.resolve("./data");
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory);
  }

  const twitchConfigPath = path.join(dataDirectory, "twitch.json");
  if (!fs.existsSync(twitchConfigPath)) {
    const defaultTwitchConfig = {
      ACCESS_TOKEN: "",
      REFRESH_TOKEN: "",
      CLIENT_ID: "",
      VALID_UNTIL: "",
    };
    fs.writeFileSync(twitchConfigPath, JSON.stringify(defaultTwitchConfig, null, 2));
    console.log("Se ha generado twitch.json con los campos por defecto.");
    process.exit(1);
  }

  const twitchConfig = await getValidTwitchConfig();

  const discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
  });

  const twitchClient = new tmi.Client({
    options: { debug: true },
    identity: {
      username: process.env.TWITCH_USERNAME,
      password: twitchConfig.ACCESS_TOKEN,
    },
    channels: [process.env.TWITCH_CHANNEL],
  });

  await twitchClient.connect();

  discordClient.commands = new Collection();

  registerEvents(discordClient, systemLogger);
  registerCommands(discordClient, systemLogger);

  discordClient.login(process.env.GALAYAKI_TOKEN).catch((error) => {
    systemLogger.error("Error connecting the bot:", error);
  });
}

main();
